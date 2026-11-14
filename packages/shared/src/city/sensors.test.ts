import { describe, expect, test } from "bun:test";
import { roadTrafficDisturbance } from "../domain";
import sensorsFixture from "./fixtures/city-sensors.json";
import { citySensors, sensorLevel } from "./sensors";

describe("city sensor fixture", () => {
  const sensors = citySensors.parse(sensorsFixture);

  test("holds about ten Newcastle sensors, all indicative", () => {
    expect(sensors).toHaveLength(10);
    expect(sensors.every((s) => s.indicative)).toBe(true);
    expect(new Set(sensors.map((s) => s.id)).size).toBe(sensors.length);
  });

  test("covers shaded, out-of-range and not-enough-data sensors", () => {
    expect(sensors.some((s) => !s.notEnoughData && !s.outOfRange)).toBe(true);
    expect(sensors.some((s) => s.outOfRange)).toBe(true);
    expect(sensors.some((s) => s.notEnoughData)).toBe(true);
  });

  test("%HSD follows the WHO curve", () => {
    for (const s of sensors) {
      if (s.lnight30 === null) continue;
      const expected = roadTrafficDisturbance(s.lnight30);
      expect(s.pctHighlySleepDisturbed).toBeCloseTo(expected.percentHighlyDisturbed, 1);
      expect(s.outOfRange).toBe(expected.outOfRange);
    }
  });

  test("not enough data means fewer than 30 nights", () => {
    for (const s of sensors) expect(s.notEnoughData).toBe(s.nights < 30);
  });

  test("rejects a non-indicative sensor and a missing estimate", () => {
    expect(sensorLevel.safeParse({ ...sensors[0], indicative: false }).success).toBe(false);
    expect(sensorLevel.safeParse({ ...sensors[0], lnight30: null }).success).toBe(false);
  });
});
