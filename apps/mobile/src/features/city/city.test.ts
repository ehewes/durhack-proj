import { describe, expect, test } from "bun:test";
import type { SensorLevel } from "@kip/shared/city";
import { CLAMP_NOTE, STATE_NOTE } from "./copy";
import { fixtureSensors } from "./data/fixture";
import {
  bandOf,
  isShaded,
  sensorDetails,
  sensorFeatures,
  sensorState,
  sortSensors,
  UNSHADED_COLOR,
} from "./sensors";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const base = fixtureSensors[0] as SensorLevel;
const make = (patch: Partial<SensorLevel>): SensorLevel => ({ ...base, ...patch });

describe("sensorState", () => {
  test("a recent sensor with 30 nights is shaded", () => {
    expect(sensorState(make({ nights: 30 }), NOW)).toBe("shaded");
  });
  test("fewer than 30 nights is not shaded", () => {
    const s = make({
      nights: 12,
      notEnoughData: true,
      lnight30: null,
      pctHighlySleepDisturbed: null,
    });
    expect(sensorState(s, NOW)).toBe("fewNights");
    expect(isShaded("fewNights")).toBe(false);
  });
  test("no nights at all is missing", () => {
    const s = make({
      nights: 0,
      notEnoughData: true,
      lnight30: null,
      pctHighlySleepDisturbed: null,
    });
    expect(sensorState(s, NOW)).toBe("missing");
  });
  test("a reading over 3 days old is stale", () => {
    expect(sensorState(make({ updatedAt: "2026-11-10T07:00:00.000Z" }), NOW)).toBe("stale");
  });
  test("out of range is shaded and flagged", () => {
    const state = sensorState(make({ outOfRange: true }), NOW);
    expect(state).toBe("outOfRange");
    expect(isShaded(state)).toBe(true);
    expect(STATE_NOTE.outOfRange).toBe(CLAMP_NOTE);
  });
  test("the five states have distinct explanations", () => {
    const notes = Object.values(STATE_NOTE).filter(Boolean);
    expect(new Set(notes).size).toBe(4);
  });
});

describe("fixture on the map", () => {
  test("one point per sensor, unshaded sensors grey", () => {
    const fc = sensorFeatures(fixtureSensors, NOW);
    expect(fc.features).toHaveLength(fixtureSensors.length);
    for (const f of fc.features) expect(f.geometry.type).toBe("Point");
    const few = fc.features.find((f) => f.properties?.state === "fewNights");
    expect(few?.properties?.color).toBe(UNSHADED_COLOR);
    const shaded = fc.features.find((f) => f.properties?.state === "shaded");
    expect(shaded?.properties?.color).not.toBe(UNSHADED_COLOR);
  });
  test("points are [longitude, latitude]", () => {
    const f = sensorFeatures([base], NOW).features[0];
    expect(f?.geometry).toEqual({ type: "Point", coordinates: [base.lon, base.lat] });
  });
  test("shade bands rise with disturbance", () => {
    expect(bandOf(2).color).not.toBe(bandOf(11).color);
    expect(bandOf(4).label).toBe("4 to 6%");
  });
  test("list puts shaded, most disturbed sensors first", () => {
    const sorted = sortSensors(fixtureSensors, NOW);
    expect(sensorState(sorted[0] as SensorLevel, NOW)).not.toBe("fewNights");
    expect(sorted.at(-1)?.notEnoughData).toBe(true);
  });
  test("details name source, Lnight, nights and last update", () => {
    const labels = sensorDetails(base).map((d) => d.label);
    expect(labels).toEqual(["Source", "30-night Lnight", "Nights", "Last update"]);
  });
});
