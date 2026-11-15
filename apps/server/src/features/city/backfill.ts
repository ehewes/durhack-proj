import type { Collection } from "mongodb";
import type { Sql } from "postgres";
import { mongo } from "../../db/mongo";
import { tiger } from "../../db/tiger";
import {
  bboxAround,
  londonWallTimeToUtc,
  NEWCASTLE_CITY_CENTRE,
  type ObservatoryClient,
} from "../../integrations/observatory";
import { CITY_RADIUS_KM, LIVE_VARIABLES, METRIC_BY_VARIABLE, remember } from "./jobs";
import {
  type CityRepo,
  SENSOR_METRICS,
  type SensorMetric,
  type SensorReadingInsert,
  type SensorUpsert,
} from "./repo";

/** Five more nights than the 30-night estimate needs, so a few gaps still leave 30. */
export const BACKFILL_NIGHTS = 35;

/** Rows per insert. Four parameters a row keeps each statement far below PostgreSQL's 65,535. */
export const INSERT_BATCH = 5000;

/** Mongo collection with one document per loaded chunk, so a rerun skips it. */
export const BACKFILL_COLLECTION = "city_backfill";

/** One London day of one metric, loaded in full. */
export type BackfillChunk = { day: string; metric: SensorMetric; readings: number };

export type SensorReadingCount = {
  sensorId: string;
  metric: SensorMetric;
  readings: number;
  /** Nights (23:00 to 07:00 London, named by the evening) with at least one reading. */
  nights: number;
};

export type BackfillStore = {
  /** `day/metric` keys of chunks already loaded in full. */
  doneChunks(): Promise<Set<string>>;
  markChunk(chunk: BackfillChunk, at: Date): Promise<void>;
  /** Re-materializes the nightly Lnight aggregate over the window. */
  refreshLnight(start: Date, end: Date): Promise<void>;
  readingCounts(since: Date): Promise<SensorReadingCount[]>;
};

export type BackfillSummary = {
  /** London dates fetched, oldest first. The last one is today, loaded so far. */
  days: string[];
  fetched: number;
  skipped: number;
  stored: number;
  sensors: number;
};

const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function chunkKey(day: string, metric: SensorMetric): string {
  return `${day}/${metric}`;
}

/** Midnight London at the start of a London date, as a UTC instant. */
export function londonDayStart(day: string): Date {
  return londonWallTimeToUtc(`${day}T00:00:00`);
}

/**
 * London dates to fetch: today and the `nights` days before it, oldest first. The night named
 * by each evening needs that evening and the next morning, so this covers `nights` nights.
 */
export function backfillDays(now: Date, nights = BACKFILL_NIGHTS): string[] {
  const today = LONDON_DATE.format(now);
  return Array.from({ length: nights + 1 }, (_, i) => shiftDate(today, i - nights));
}

/**
 * Loads Observatory history for Sound, NO2 and PM2.5 through the v2 API, one London day of one
 * series at a time, with the live pull's filters. Readings land on their primary key, so a
 * repeat stores nothing twice. Each finished past day is marked, so a rerun after a stop picks
 * up where it left off. Today is fetched up to now and never marked.
 */
export async function backfillCity(deps: {
  client: Pick<ObservatoryClient, "history">;
  repo: Pick<CityRepo, "insertReadings" | "upsertSensors">;
  store: Pick<BackfillStore, "doneChunks" | "markChunk">;
  now?: Date;
  nights?: number;
  /** Ignore the markers and fetch every chunk again. */
  force?: boolean;
  batchSize?: number;
  log?: (line: string) => void;
}): Promise<BackfillSummary> {
  const now = deps.now ?? new Date();
  const batch = deps.batchSize ?? INSERT_BATCH;
  const log = deps.log ?? (() => {});
  const days = backfillDays(now, deps.nights ?? BACKFILL_NIGHTS);
  const done = deps.force ? new Set<string>() : await deps.store.doneChunks();
  const bbox = bboxAround(NEWCASTLE_CITY_CENTRE, CITY_RADIUS_KM);
  const seen = new Set<string>();
  const summary: BackfillSummary = { days, fetched: 0, skipped: 0, stored: 0, sensors: 0 };

  for (const day of days) {
    const start = londonDayStart(day);
    const dayEnd = londonDayStart(shiftDate(day, 1));
    const complete = dayEnd.getTime() <= now.getTime();
    const end = complete ? dayEnd : now;
    if (end.getTime() <= start.getTime()) continue;

    for (const variable of LIVE_VARIABLES) {
      const metric = METRIC_BY_VARIABLE[variable];
      if (!metric) continue;
      if (complete && done.has(chunkKey(day, metric))) {
        summary.skipped += 1;
        continue;
      }

      const history = await deps.client.history({ start, end, variables: [variable], bbox });
      const located = new Map(history.sensors.map((sensor) => [sensor.name, sensor]));
      const readings = new Map<string, SensorReadingInsert>();
      const sensors = new Map<string, SensorUpsert>();
      for (const reading of history.readings) {
        const sensor = located.get(reading.sensorName);
        if (sensor) remember({ sensor, reading }, now, readings, sensors);
      }

      const rows = [...readings.values()];
      for (let i = 0; i < rows.length; i += batch) {
        await deps.repo.insertReadings(rows.slice(i, i + batch));
      }
      await deps.repo.upsertSensors([...sensors.values()]);
      if (complete) await deps.store.markChunk({ day, metric, readings: rows.length }, now);

      summary.fetched += 1;
      summary.stored += rows.length;
      for (const id of sensors.keys()) seen.add(id);
      log(
        `${day} ${metric}: ${rows.length} readings from ${sensors.size} sensors` +
          (complete ? "" : " (today so far, not marked)"),
      );
    }
  }

  summary.sensors = seen.size;
  return summary;
}

/** Readings and nights per sensor and metric since `since`. A night runs 23:00 to 07:00 London. */
export function readingCountsStatement(since: Date): { text: string; values: [Date] } {
  const london = "(time at time zone 'Europe/London')";
  return {
    text: [
      "select sensor_id, metric, count(*)::int as readings,",
      `(count(distinct date(${london} - interval '7 hours'))`,
      `filter (where extract(hour from ${london}) >= 23 or extract(hour from ${london}) < 7))::int as nights`,
      "from sensor_readings where time >= $1",
      "group by sensor_id, metric order by sensor_id, metric",
    ].join(" "),
    values: [since],
  };
}

/** One line per sensor: nights and readings for each metric. */
export function sensorCountLines(counts: readonly SensorReadingCount[]): string[] {
  const bySensor = new Map<string, SensorReadingCount[]>();
  for (const row of counts)
    bySensor.set(row.sensorId, [...(bySensor.get(row.sensorId) ?? []), row]);
  return [...bySensor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sensorId, rows]) => {
      const parts = SENSOR_METRICS.map((metric) => {
        const row = rows.find((r) => r.metric === metric);
        return row ? `${metric} ${row.nights} nights (${row.readings} readings)` : `${metric} none`;
      });
      return `${sensorId}: ${parts.join(", ")}`;
    });
}

type BackfillChunkDocument = {
  _id: string;
  day: string;
  metric: SensorMetric;
  readings: number;
  completedAt: Date;
};

type CountRow = { sensor_id: string; metric: SensorMetric; readings: number; nights: number };

export function createBackfillStore(
  sql: Sql = tiger(),
  chunks: Collection<BackfillChunkDocument> = mongo().collection<BackfillChunkDocument>(
    BACKFILL_COLLECTION,
  ),
): BackfillStore {
  return {
    async doneChunks() {
      const docs = await chunks.find({}, { projection: { _id: 1 } }).toArray();
      return new Set(docs.map((doc) => doc._id));
    },
    async markChunk(chunk, at) {
      await chunks.updateOne(
        { _id: chunkKey(chunk.day, chunk.metric) },
        {
          $set: { day: chunk.day, metric: chunk.metric, readings: chunk.readings, completedAt: at },
        },
        { upsert: true },
      );
    },
    async refreshLnight(start, end) {
      await sql.unsafe(
        "call refresh_continuous_aggregate('sensor_lnight_daily', $1::timestamptz, $2::timestamptz)",
        [start, end],
      );
    },
    async readingCounts(since) {
      const statement = readingCountsStatement(since);
      const rows = await sql.unsafe<CountRow[]>(statement.text, statement.values);
      return rows.map((row) => ({
        sensorId: row.sensor_id,
        metric: row.metric,
        readings: row.readings,
        nights: row.nights,
      }));
    },
  };
}

function flagValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3);
}

if (import.meta.main) {
  const { requireEnv } = await import("../../env");
  // Missing keys fail here at once, not after the connection retries.
  requireEnv("TIGER_URI");
  requireEnv("MONGO_URI");
  const { closeMongo, connectMongo } = await import("../../db/mongo");
  const { closeTiger, connectTiger } = await import("../../db/tiger");
  const { createObservatoryClient } = await import("../../integrations/observatory");
  const { createCityRepo } = await import("./repo");
  const { refreshSensorLnight } = await import("./service");
  await connectTiger();
  await connectMongo();
  try {
    const now = new Date();
    const nights = Number(flagValue("nights") ?? BACKFILL_NIGHTS);
    const repo = createCityRepo();
    const store = createBackfillStore();
    const summary = await backfillCity({
      client: createObservatoryClient(),
      repo,
      store,
      now,
      nights,
      force: process.argv.includes("--force"),
      log: (line) => console.log(line),
    });
    const since = londonDayStart(summary.days[0] ?? LONDON_DATE.format(now));
    await store.refreshLnight(since, now);
    const levels = await refreshSensorLnight({ repo, now });
    for (const line of sensorCountLines(await store.readingCounts(since))) console.log(line);
    console.log(
      `city backfill: ${summary.days.length} days (${summary.days[0]} to ${summary.days.at(-1)}), ` +
        `${summary.fetched} chunks fetched, ${summary.skipped} skipped, ${summary.stored} readings ` +
        `stored from ${summary.sensors} sensors. Lnight refreshed; ${levels} sensors have levels.`,
    );
  } finally {
    await closeMongo();
    await closeTiger();
  }
}
