import { describe, expect, mock, test } from "bun:test";
import type { Db } from "mongodb";
import { retry } from "../retry";
import { ensureIndexes, INDEXES } from "./indexes";
import { type MigrationFile, migrate, readMigrations, type SqlClient } from "./migrate";

function fakeSql({ applied = [] as string[], timescale = true } = {}) {
  const executed: string[] = [];
  const recorded: string[] = [...applied];
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("from _migrations")) return recorded.map((name) => ({ name }));
    if (text.includes("insert into _migrations")) recorded.push(String(values[0]));
    if (text.includes("pg_extension")) return timescale ? [{ extname: "timescaledb" }] : [];
    return [];
  }) as SqlClient;
  sql.unsafe = async (query: string) => {
    executed.push(query);
    return [];
  };
  sql.begin = async (fn) => fn(sql);
  return { sql, executed, recorded };
}

const files: MigrationFile[] = [
  { name: "202611141300_city_readings.sql", sql: "create table b();" },
  { name: "202611141200_platform_timescaledb.sql", sql: "create extension a;" },
];

describe("migrate", () => {
  test("applies pending files in filename order and records them", async () => {
    const { sql, executed, recorded } = fakeSql();
    expect(await migrate(sql, files)).toEqual([
      "202611141200_platform_timescaledb.sql",
      "202611141300_city_readings.sql",
    ]);
    expect(executed).toEqual(["create extension a;", "create table b();"]);
    expect(recorded).toHaveLength(2);
  });

  test("skips files already applied", async () => {
    const { sql, executed } = fakeSql({ applied: ["202611141200_platform_timescaledb.sql"] });
    expect(await migrate(sql, files)).toEqual(["202611141300_city_readings.sql"]);
    expect(executed).toEqual(["create table b();"]);
  });

  test("fails when TimescaleDB is missing", async () => {
    const { sql } = fakeSql({ timescale: false });
    await expect(migrate(sql, files)).rejects.toThrow("TimescaleDB extension is missing");
  });

  test("reads the repo's migration files", async () => {
    const names = (await readMigrations()).map((f) => f.name);
    expect(names[0]).toBe("202611141200_platform_timescaledb.sql");
    for (const name of names) expect(name).toMatch(/^\d{12}_[a-z]+_[a-z0-9_]+\.sql$/);
  });
});

describe("ensureIndexes", () => {
  test("creates every collection and index from the architecture table", async () => {
    const created: string[] = [];
    const indexes: [string, unknown][] = [];
    const db = {
      listCollections: () => ({ toArray: async () => [{ name: "users" }] }),
      createCollection: async (name: string) => created.push(name),
      collection: (name: string) => ({
        createIndex: async (spec: unknown) => indexes.push([name, spec]),
      }),
    } as unknown as Db;
    await ensureIndexes(db);
    expect(created.sort()).toEqual(["hotels", "nights", "sensors", "venues", "works"]);
    expect(indexes).toContainEqual(["hotels", { location: "2dsphere" }]);
    expect(indexes).toContainEqual(["works", { geometry: "2dsphere" }]);
    expect(indexes).toContainEqual(["nights", { userId: 1, startedAt: -1 }]);
    expect(indexes).toHaveLength(Object.values(INDEXES).flat().length);
  });
});

describe("retry", () => {
  test("backs off exponentially, capped, then succeeds", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await retry(
      "test",
      async () => {
        if (++calls < 5) throw new Error("postgres://user:secret@host refused");
        return "ok";
      },
      { baseDelayMs: 100, maxDelayMs: 500, sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([100, 200, 400, 500]);
  });

  test("never logs the error, which can hold credentials", async () => {
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn;
    try {
      await expect(
        retry("db", async () => Promise.reject(new Error("mongodb://u:secret@x")), {
          attempts: 2,
          sleep: async () => {},
        }),
      ).rejects.toThrow("db: gave up after 2 attempts");
    } finally {
      console.warn = original;
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });
});
