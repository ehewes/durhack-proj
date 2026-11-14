import { isInNightWindow, MIN_NIGHTS_FOR_ESTIMATE, nightOf, toLocalTime } from "@kip/shared/domain";
import type { AnyBulkWriteOperation, Collection } from "mongodb";
import type { Sql } from "postgres";
import { mongo } from "../../db/mongo";
import { tiger } from "../../db/tiger";

/** Architecture key columns: noise_db (Sound), no2, pm25. */
export const SENSOR_METRICS = ["noise_db", "no2", "pm25"] as const;
export type SensorMetric = (typeof SENSOR_METRICS)[number];

/** Mongo collection from docs/ARCHITECTURE.md. The 2dsphere index is on `location`. */
export const SENSORS_COLLECTION = "sensors";

export type SensorReadingInsert = {
  time: Date;
  sensorId: string;
  metric: SensorMetric;
  value: number;
};

export type SensorUpsert = {
  sensorId: string;
  name: string;
  longitude: number;
  latitude: number;
  broker: string;
  heightAboveGround: number | null;
  metrics: SensorMetric[];
  updatedAt: Date;
};

/** Observatory sensor kept for the map. `_id` is the Observatory raw id. */
export type SensorDocument = {
  _id: string;
  name: string;
  location: { type: "Point"; coordinates: [number, number] };
  broker: string;
  heightAboveGround: number | null;
  metrics: SensorMetric[];
  updatedAt: Date;
  /** Energy average of nightly Lnight. Null when fewer than 30 nights are in the window. */
  lnight30?: number | null;
  /** Indicative % highly sleep disturbed. Null when there is not enough data. */
  pctHighlySleepDisturbed?: number | null;
  /** Nights of noise inside the last 30 completed nights. */
  nights?: number;
  /** Lnight fell outside 40 to 65 dB and the curve clamped it. */
  outOfRange?: boolean;
  /** Fewer than 30 nights: the map shows the sensor and does not shade it. */
  notEnoughData?: boolean;
  /** City figures are an indicative road-traffic estimate. */
  indicative?: true;
};

/** Inclusive London dates of the last 30 completed nights. */
export type LnightWindow = {
  start: string;
  end: string;
};

/** One sensor's 30-night rollup. `lnight30` is null when `notEnoughData` is set. */
export type SensorLnightReport = {
  sensorId: string;
  nights: number;
  lnight30: number | null;
  notEnoughData: boolean;
  latestBucket: Date | null;
};

/** Fields the Lnight job writes onto an existing `sensors` document. */
export type SensorLevelWrite = {
  sensorId: string;
  lnight30: number | null;
  pctHighlySleepDisturbed: number | null;
  nights: number;
  outOfRange: boolean;
  notEnoughData: boolean;
  indicative: true;
};

export type CityRepo = {
  /** Inserts readings. A repeated (time, sensor, metric) is a no-op. */
  insertReadings(rows: SensorReadingInsert[]): Promise<void>;
  /** Upserts each sensor as a GeoJSON point. Other fields on the document are left alone. */
  upsertSensors(sensors: SensorUpsert[]): Promise<void>;
  /**
   * Energy average of nightly Lnight over the last 30 completed nights.
   * Fewer than 30 nights is reported as not enough data, with `lnight30` null.
   */
  lnight30(now?: Date): Promise<SensorLnightReport[]>;
  /** Writes level fields onto existing sensors. An empty list is a no-op. */
  writeSensorLevels(levels: SensorLevelWrite[]): Promise<void>;
};

type ReadingValue = Date | string | number;

function readingKey(row: SensorReadingInsert): string {
  return `${row.time.toISOString()}\0${row.sensorId}\0${row.metric}`;
}

/** One row per primary key. PostgreSQL rejects an insert that names the same key twice. */
export function dedupeReadings(rows: readonly SensorReadingInsert[]): SensorReadingInsert[] {
  const byKey = new Map<string, SensorReadingInsert>();
  for (const row of rows) byKey.set(readingKey(row), row);
  return [...byKey.values()].sort(
    (a, b) =>
      a.sensorId.localeCompare(b.sensorId) ||
      a.metric.localeCompare(b.metric) ||
      a.time.getTime() - b.time.getTime(),
  );
}

export function insertReadingsStatement(rows: readonly SensorReadingInsert[]): {
  text: string;
  values: ReadingValue[];
} {
  const unique = dedupeReadings(rows);
  const values: ReadingValue[] = [];
  const tuples: string[] = [];
  for (const row of unique) {
    const offset = values.length;
    values.push(row.time, row.sensorId, row.metric, row.value);
    tuples.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
  }
  return {
    text: [
      "insert into sensor_readings (time, sensor_id, metric, value)",
      `values ${tuples.join(", ")}`,
      "on conflict (time, sensor_id, metric) do nothing",
    ].join(" "),
    values,
  };
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The newest night whose window has ended, named by its evening.
 * A night still inside 23:00 to 07:00 is left out, and so is the coming night
 * named by `nightOf` after noon.
 */
export function latestCompletedNight(now: Date): string {
  const named = nightOf(now);
  if (isInNightWindow(now)) return shiftDate(named, -1);
  if (toLocalTime(now).minutes >= 12 * 60) return shiftDate(named, -1);
  return named;
}

/** Last 30 completed London nights, inclusive. `end` is the newest. */
export function completedNightWindow(now: Date): LnightWindow {
  const end = latestCompletedNight(now);
  return { start: shiftDate(end, -(MIN_NIGHTS_FOR_ESTIMATE - 1)), end };
}

/**
 * 30-night Lnight per sensor. The inner average is the energy average of the
 * nightly Lnight values already stored on `sensor_lnight_daily`. Sensors with
 * only older nights stay in the result so a stale estimate can be cleared.
 */
export function lnight30Statement(window: LnightWindow): {
  text: string;
  values: [string, string];
} {
  return {
    text: [
      "with bounds as (",
      "select $1::date as start_night, $2::date as end_night",
      "),",
      "nights as (",
      "select sensor_id, bucket, lnight,",
      "(bucket at time zone 'Europe/London')::date as night",
      "from sensor_lnight_daily",
      ")",
      "select sensor_id,",
      "count(*) filter (",
      "where night between bounds.start_night and bounds.end_night",
      ")::int as nights,",
      "10 * log(avg(power(10, lnight / 10)) filter (",
      "where night between bounds.start_night and bounds.end_night",
      ")) as lnight_db,",
      "max(bucket) filter (",
      "where night between bounds.start_night and bounds.end_night",
      ") as latest_bucket",
      "from nights",
      "cross join bounds",
      "group by sensor_id",
      "order by sensor_id",
    ].join(" "),
    values: [window.start, window.end],
  };
}

type LnightSqlRow = {
  sensor_id: string;
  nights: number | string;
  lnight_db: number | string | null;
  latest_bucket: Date | string | null;
};

function asFinite(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fewer than 30 nights in the window is not enough data, and carries no Lnight. */
export function reportLnight30(row: {
  sensorId: string;
  nights: number;
  lnightDb: number | null;
  latestBucket: Date | null;
}): SensorLnightReport {
  const notEnoughData = row.nights < MIN_NIGHTS_FOR_ESTIMATE || row.lnightDb === null;
  return {
    sensorId: row.sensorId,
    nights: row.nights,
    notEnoughData,
    lnight30: notEnoughData ? null : row.lnightDb,
    latestBucket: row.latestBucket,
  };
}

function reportRow(row: LnightSqlRow): SensorLnightReport {
  return reportLnight30({
    sensorId: row.sensor_id,
    nights: Number(row.nights),
    lnightDb: asFinite(row.lnight_db),
    latestBucket: asDate(row.latest_bucket),
  });
}

function levelWrite(level: SensorLevelWrite): AnyBulkWriteOperation<SensorDocument> {
  return {
    updateOne: {
      filter: { _id: level.sensorId },
      update: {
        $set: {
          lnight30: level.lnight30,
          pctHighlySleepDisturbed: level.pctHighlySleepDisturbed,
          nights: level.nights,
          outOfRange: level.outOfRange,
          notEnoughData: level.notEnoughData,
          indicative: true,
        },
      },
      upsert: false,
    },
  };
}

function sensorWrite(point: SensorUpsert): AnyBulkWriteOperation<SensorDocument> {
  return {
    updateOne: {
      filter: { _id: point.sensorId },
      update: {
        $set: {
          name: point.name,
          location: {
            type: "Point",
            coordinates: [point.longitude, point.latitude],
          },
          broker: point.broker,
          heightAboveGround: point.heightAboveGround,
          updatedAt: point.updatedAt,
        },
        $addToSet: { metrics: { $each: point.metrics } },
      },
      upsert: true,
    },
  };
}

export function createCityRepo(
  sql: Sql = tiger(),
  sensors: Collection<SensorDocument> = mongo().collection<SensorDocument>(SENSORS_COLLECTION),
): CityRepo {
  return {
    async insertReadings(rows) {
      if (rows.length === 0) return;
      const statement = insertReadingsStatement(rows);
      await sql.unsafe(statement.text, statement.values);
    },
    async upsertSensors(points) {
      if (points.length === 0) return;
      await sensors.bulkWrite(points.map(sensorWrite));
    },
    async lnight30(now = new Date()) {
      const statement = lnight30Statement(completedNightWindow(now));
      const rows = await sql.unsafe<LnightSqlRow[]>(statement.text, statement.values);
      return rows.map(reportRow);
    },
    async writeSensorLevels(levels) {
      if (levels.length === 0) return;
      await sensors.bulkWrite(levels.map(levelWrite));
    },
  };
}
