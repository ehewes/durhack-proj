import { describe, expect, test } from "bun:test";
import { readMigrations } from "../../db/migrate";
import { epochSeconds, isoOffset } from "./repo";

describe("night migration", () => {
  test("creates night_noise and vitals hypertables and a sleep_stages table", async () => {
    const files = (await readMigrations()).filter((file) => file.name.includes("_night_"));
    expect(files.map((file) => file.name)).toEqual(["202611141930_night_series.sql"]);
    const sql = files.map((file) => file.sql).join("\n");
    expect(sql).toContain("create table if not exists night_noise");
    expect(sql).toContain("create table if not exists vitals");
    expect(sql).toContain("create table if not exists sleep_stages");
    expect(sql).toContain("create_hypertable('night_noise'");
    expect(sql).toContain("create_hypertable('vitals'");
    expect(sql).not.toContain("create_hypertable('sleep_stages'");
    expect(sql).toContain("relative dB");
  });
});

test("Tiger timestamps round-trip as UTC offsets", () => {
  const instant = new Date("2026-11-13T23:00:00+00:00");
  expect(isoOffset(instant)).toBe("2026-11-13T23:00:00+00:00");
  expect(epochSeconds(instant)).toBe(1794610800);
});
