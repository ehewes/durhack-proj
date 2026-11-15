import { expect, test } from "bun:test";
import { buildUpload, collectNight, exportDateToIso, importedNightId } from "./health-export";

const USER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";

const rec = (type: string, value: string, start: string, end = start) =>
  `<Record type="${type}" sourceName="Watch" unit="x" startDate="${start}" endDate="${end}" value="${value}"/>`;

const lines = [
  `<?xml version="1.0"?>`,
  `<HealthData locale="en_GB">`,
  rec(
    SLEEP,
    "HKCategoryValueSleepAnalysisAsleepCore",
    "2026-11-14 00:00:00 +0000",
    "2026-11-14 01:00:00 +0000",
  ),
  rec(
    SLEEP,
    "HKCategoryValueSleepAnalysisInBed",
    "2026-11-13 23:30:00 +0000",
    "2026-11-14 00:00:00 +0000",
  ),
  rec(
    SLEEP,
    "HKCategoryValueSleepAnalysisAsleepREM",
    "2026-11-14 01:00:00 +0000",
    "2026-11-14 02:00:00 +0000",
  ),
  rec(
    SLEEP,
    "HKCategoryValueSleepAnalysisAsleepCore",
    "2026-11-12 23:30:00 +0000",
    "2026-11-13 06:00:00 +0000",
  ),
  rec("HKQuantityTypeIdentifierHeartRate", "58", "2026-11-14 00:30:00 +0000"),
  rec("HKQuantityTypeIdentifierHeartRate", "90", "2026-11-13 15:00:00 +0000"),
  rec("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "44.5", "2026-11-14 01:10:00 +0000"),
  rec("HKQuantityTypeIdentifierRespiratoryRate", "14", "2026-11-14 00:45:00 +0000"),
  rec("HKQuantityTypeIdentifierStepCount", "12", "2026-11-14 00:45:00 +0000"),
  `</HealthData>`,
];

function parse(night: string) {
  const c = collectNight(night);
  for (const line of lines) c.add(line);
  return c.finish();
}

test("exportDateToIso rewrites the export format", () => {
  expect(exportDateToIso("2026-11-13 23:04:12 +0100")).toBe("2026-11-13T23:04:12+01:00");
  expect(exportDateToIso("nonsense")).toBeNull();
});

test("collects one night's stages and series in time order", () => {
  const n = parse("2026-11-13");
  expect(n.stages.map((s) => s.stage)).toEqual(["inBed", "core", "rem"]);
  expect(n.heartRate).toEqual([[Date.parse("2026-11-14T00:30:00Z") / 1000, 58]]);
  expect(n.hrv).toHaveLength(1);
  expect(n.respiratoryRate).toHaveLength(1);
});

test("drops daytime readings and other nights", () => {
  const other = parse("2026-11-12");
  expect(other.stages).toHaveLength(1);
  expect(other.heartRate).toHaveLength(0);
});

test("builds a health-only upload that the shared contract accepts", () => {
  const up = buildUpload(USER, "2026-11-13", parse("2026-11-13"));
  expect(up.startedAt).toBe("2026-11-13T23:30:00+00:00");
  expect(up.endedAt).toBe("2026-11-14T02:00:00+00:00");
  expect(up.consent).toEqual({ microphone: false, health: true, location: false });
  expect(up.noise.samples).toEqual([]);
});

test("the night ID is stable per user and night", () => {
  expect(importedNightId(USER, "2026-11-13")).toBe(importedNightId(USER, "2026-11-13"));
  expect(importedNightId(USER, "2026-11-13")).not.toBe(importedNightId(USER, "2026-11-12"));
});

test("a night with no sleep stages is an error", () => {
  expect(() => buildUpload(USER, "2026-01-01", parse("2026-01-01"))).toThrow("No sleep stages");
});
