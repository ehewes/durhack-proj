import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyBulkWriteOperation, Collection } from "mongodb";
import type { Sql } from "postgres";
import {
  createCityRepo,
  dedupeReadings,
  insertReadingsStatement,
  SENSORS_COLLECTION,
  type SensorDocument,
  type SensorReadingInsert,
} from "./repo";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations/202611141545_city_sensor_readings.sql",
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
