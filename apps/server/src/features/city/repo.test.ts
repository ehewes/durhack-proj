import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyBulkWriteOperation, Collection } from "mongodb";
import type { Sql } from "postgres";
import {
  completedNightWindow,
  createCityRepo,
  dedupeReadings,
  insertReadingsStatement,
  latestCompletedNight,
  lnight30Statement,
  reportLnight30,
  SENSORS_COLLECTION,
  type SensorDocument,
  type SensorReadingInsert,
} from "./repo";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations/202611141545_city_sensor_readings.sql",
);
const lnightMigrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations/202611142100_city_lnight_daily.sql",
);

const at = new Date("2026-11-14T14:29:00.000Z");

function row(overrides: Partial<SensorReadingInsert> = {}): SensorReadingInsert {
  return {
    time: at,
    sensorId: "79164",
    metric: "no2",
    value: 45.51,
    ...overrides,
  };
}

function spanDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return ms / 86_400_000 + 1;
}

describe("sensor_lnight_daily migration", () => {
  const sql = readFileSync(lnightMigrationPath, "utf8");

  test("creates the night-window continuous aggregate outside a transaction", () => {
    expect(sql.startsWith("-- kip:no-transaction\n")).toBe(true);
    expect(sql).toContain("create materialized view if not exists sensor_lnight_daily");
    expect(sql).toContain("with (timescaledb.continuous, timescaledb.materialized_only = false)");
    expect(sql).toContain("time_bucket(");
    expect(sql).toContain("'Europe/London'");
    expect(sql).toContain("timestamptz '2000-01-03 07:00:00+00'");
    expect(sql).toContain("10 * log(avg(power(10, value / 10))) as lnight");
    expect(sql).toContain("metric = 'noise_db'");
    expect(sql).toContain("extract(hour from time at time zone 'Europe/London') >= 23");
    expect(sql).toContain("extract(hour from time at time zone 'Europe/London') < 7");
    expect(sql).toContain("group by bucket, sensor_id");
    expect(sql).toContain("with no data");
  });

  test("refreshes the last 40 days every five minutes", () => {
    expect(sql).toContain("add_continuous_aggregate_policy(");
    expect(sql).toContain("start_offset => interval '40 days'");
    expect(sql).toContain("end_offset => interval '1 hour'");
    expect(sql).toContain("schedule_interval => interval '5 minutes'");
    expect(sql).toContain("if_not_exists => true");
    expect(sql).toContain("timezone => 'Europe/London'");
  });
});

describe("completedNightWindow", () => {
  test("uses the 30 completed nights ending the morning after a winter night", () => {
    const now = new Date("2026-11-15T10:00:00.000Z");
    expect(latestCompletedNight(now)).toBe("2026-11-14");
    expect(completedNightWindow(now)).toEqual({ start: "2026-10-16", end: "2026-11-14" });
    expect(spanDays("2026-10-16", "2026-11-14")).toBe(30);
  });

  test("leaves out the night still in progress, in GMT and BST", () => {
    expect(latestCompletedNight(new Date("2026-11-15T03:00:00.000Z"))).toBe("2026-11-13");
    expect(latestCompletedNight(new Date("2026-11-15T23:30:00.000Z"))).toBe("2026-11-14");
    expect(latestCompletedNight(new Date("2026-07-01T22:30:00.000Z"))).toBe("2026-06-30");
    expect(latestCompletedNight(new Date("2026-07-01T06:30:00.000Z"))).toBe("2026-06-30");
  });

  test("keeps the clock-change nights whole once they have ended", () => {
    expect(latestCompletedNight(new Date("2026-10-25T01:30:00.000Z"))).toBe("2026-10-23");
    expect(latestCompletedNight(new Date("2026-10-25T07:00:00.000Z"))).toBe("2026-10-24");
    expect(latestCompletedNight(new Date("2026-03-29T05:59:00.000Z"))).toBe("2026-03-27");
    expect(latestCompletedNight(new Date("2026-03-29T06:00:00.000Z"))).toBe("2026-03-28");
  });
});

describe("lnight30Statement", () => {
  test("energy-averages nightly Lnight over the completed window", () => {
    const statement = lnight30Statement({ start: "2026-10-16", end: "2026-11-14" });
    expect(statement.values).toEqual(["2026-10-16", "2026-11-14"]);
    expect(statement.text).toContain("from sensor_lnight_daily");
    expect(statement.text).toContain("(bucket at time zone 'Europe/London')::date as night");
    expect(statement.text).toContain(
      "10 * log(avg(power(10, lnight / 10)) filter ( where night between bounds.start_night and bounds.end_night )) as lnight_db",
    );
    expect(statement.text).toContain("count(*) filter (");
    expect(statement.text).toContain("$1::date");
    expect(statement.text).toContain("$2::date");
    expect(statement.text).toContain("order by sensor_id");
  });
});

describe("reportLnight30", () => {
  const latest = new Date("2026-11-14T07:00:00.000Z");

  test("reports fewer than 30 nights as not enough data", () => {
    expect(
      reportLnight30({ sensorId: "s", nights: 29, lnightDb: 55, latestBucket: latest }),
    ).toEqual({
      sensorId: "s",
      nights: 29,
      lnight30: null,
      notEnoughData: true,
      latestBucket: latest,
    });
    expect(
      reportLnight30({ sensorId: "s", nights: 0, lnightDb: null, latestBucket: null }),
    ).toEqual({
      sensorId: "s",
      nights: 0,
      lnight30: null,
      notEnoughData: true,
      latestBucket: null,
    });
  });

  test("keeps the energy average once 30 nights are present", () => {
    expect(
      reportLnight30({ sensorId: "s", nights: 30, lnightDb: 55, latestBucket: latest }),
    ).toEqual({
      sensorId: "s",
      nights: 30,
      lnight30: 55,
      notEnoughData: false,
      latestBucket: latest,
    });
  });
});

describe("sensor_readings migration", () => {
  test("creates a hypertable keyed by time, sensor and metric", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create table if not exists sensor_readings");
    expect(sql).toContain("primary key (time, sensor_id, metric)");
    expect(sql).toContain("check (metric in ('noise_db', 'no2', 'pm25'))");
    expect(sql).toContain("create_hypertable('sensor_readings', 'time', if_not_exists => true)");
    expect(sql).toContain("sensor_readings_sensor_metric_time_idx");
  });
});

describe("insertReadingsStatement", () => {
  test("inserts once and ignores the same sample on the next poll", () => {
    const statement = insertReadingsStatement([row(), row({ value: 99 })]);
    expect(statement.text).toBe(
      [
        "insert into sensor_readings (time, sensor_id, metric, value)",
        "values ($1, $2, $3, $4)",
        "on conflict (time, sensor_id, metric) do nothing",
      ].join(" "),
    );
    // The second copy of the key is dropped so PostgreSQL does not reject the batch.
    expect(statement.values).toEqual([at, "79164", "no2", 99]);
    expect(dedupeReadings([row({ sensorId: "b", metric: "pm25" }), row()])).toEqual([
      row(),
      row({ sensorId: "b", metric: "pm25" }),
    ]);
  });
});

describe("createCityRepo", () => {
  test("writes readings through the idempotent statement and skips an empty batch", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const sql = {
      unsafe: async (query: string, values: unknown[] = []) => {
        calls.push({ query, values });
        return [];
      },
    };
    const repo = createCityRepo(sql as unknown as Sql, fakeSensors().collection);
    await repo.insertReadings([]);
    await repo.insertReadings([row(), row({ metric: "pm25", value: 5.01 })]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain("on conflict (time, sensor_id, metric) do nothing");
    expect(calls[0]?.values).toEqual([at, "79164", "no2", 45.51, at, "79164", "pm25", 5.01]);
  });

  test("upserts a GeoJSON point and leaves an empty sensor list unsent", async () => {
    const sensors = fakeSensors();
    const repo = createCityRepo({ unsafe: async () => [] } as unknown as Sql, sensors.collection);
    const updatedAt = new Date("2026-11-14T15:00:00.000Z");
    await repo.upsertSensors([]);
    await repo.upsertSensors([
      {
        sensorId: "79164",
        name: "PER_AIRMON_MESH1921150",
        longitude: -1.614127,
        latitude: 54.972662,
        broker: "aq_mesh_api",
        heightAboveGround: 2,
        metrics: ["no2", "pm25"],
        updatedAt,
      },
    ]);
    expect(sensors.batches).toHaveLength(1);
    expect(sensors.batches[0]).toEqual([
      {
        updateOne: {
          filter: { _id: "79164" },
          update: {
            $set: {
              name: "PER_AIRMON_MESH1921150",
              location: { type: "Point", coordinates: [-1.614127, 54.972662] },
              broker: "aq_mesh_api",
              heightAboveGround: 2,
              updatedAt,
            },
            $addToSet: { metrics: { $each: ["no2", "pm25"] } },
          },
          upsert: true,
        },
      },
    ]);
    expect(SENSORS_COLLECTION).toBe("sensors");
  });

  test("reads the 30-night rollup and clears a short history", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const latest = new Date("2026-11-14T07:00:00.000Z");
    const sql = {
      unsafe: async (query: string, values: unknown[] = []) => {
        calls.push({ query, values });
        return [
          {
            sensor_id: "short",
            nights: "12",
            lnight_db: "58.1",
            latest_bucket: latest.toISOString(),
          },
          { sensor_id: "full", nights: 30, lnight_db: 55, latest_bucket: latest },
        ];
      },
    };
    const repo = createCityRepo(sql as unknown as Sql, fakeSensors().collection);
    const reports = await repo.lnight30(new Date("2026-11-15T10:00:00.000Z"));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual(["2026-10-16", "2026-11-14"]);
    expect(calls[0]?.query).toContain("10 * log(avg(power(10, lnight / 10))");
    expect(reports).toEqual([
      {
        sensorId: "short",
        nights: 12,
        lnight30: null,
        notEnoughData: true,
        latestBucket: latest,
      },
      {
        sensorId: "full",
        nights: 30,
        lnight30: 55,
        notEnoughData: false,
        latestBucket: latest,
      },
    ]);
  });

  test("writes level fields onto existing sensors and skips an empty list", async () => {
    const sensors = fakeSensors();
    const repo = createCityRepo({ unsafe: async () => [] } as unknown as Sql, sensors.collection);
    await repo.writeSensorLevels([]);
    await repo.writeSensorLevels([
      {
        sensorId: "full",
        lnight30: 55,
        pctHighlySleepDisturbed: 6.2,
        nights: 30,
        outOfRange: false,
        notEnoughData: false,
        indicative: true,
      },
    ]);
    expect(sensors.batches).toHaveLength(1);
    expect(sensors.batches[0]).toEqual([
      {
        updateOne: {
          filter: { _id: "full" },
          update: {
            $set: {
              lnight30: 55,
              pctHighlySleepDisturbed: 6.2,
              nights: 30,
              outOfRange: false,
              notEnoughData: false,
              indicative: true,
            },
          },
          upsert: false,
        },
      },
    ]);
  });

  test("lists every sensor ordered by id", async () => {
    const seen: { filter: unknown; options: unknown }[] = [];
    const docs = [{ _id: "a" }, { _id: "b" }] as SensorDocument[];
    const collection = {
      find: (filter: unknown, options: unknown) => {
        seen.push({ filter, options });
        return { toArray: async () => docs };
      },
    };
    const repo = createCityRepo(
      { unsafe: async () => [] } as unknown as Sql,
      collection as unknown as Collection<SensorDocument>,
    );
    expect(await repo.listSensors()).toEqual(docs);
    expect(seen).toEqual([{ filter: {}, options: { sort: { _id: 1 } } }]);
  });
});

function fakeSensors() {
  const batches: AnyBulkWriteOperation<SensorDocument>[][] = [];
  const collection = {
    bulkWrite: async (operations: AnyBulkWriteOperation<SensorDocument>[]) => {
      batches.push(operations);
      return { ok: 1 };
    },
  };
  return { batches, collection: collection as unknown as Collection<SensorDocument> };
}
