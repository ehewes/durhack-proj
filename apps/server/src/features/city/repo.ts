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
};

export type CityRepo = {
  /** Inserts readings. A repeated (time, sensor, metric) is a no-op. */
  insertReadings(rows: SensorReadingInsert[]): Promise<void>;
  /** Upserts each sensor as a GeoJSON point. Other fields on the document are left alone. */
  upsertSensors(sensors: SensorUpsert[]): Promise<void>;
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
  };
}
