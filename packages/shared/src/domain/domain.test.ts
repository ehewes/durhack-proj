import { describe, expect, test } from "bun:test";
import { isOutsideConstructionHours } from "./construction-hours";
import { energyAverageDb, isNightTime } from "./noise";
import { roadTrafficDisturbance } from "./who";

describe("roadTrafficDisturbance", () => {
  test.each([
    [45, 2.9],
    [55, 6.2],
    [60, 8.8],
  ])("%d dB gives %d%%", (db, expected) => {
    const result = roadTrafficDisturbance(db);
    expect(result.percentHighlyDisturbed).toBeCloseTo(expected, 1);
    expect(result.outOfRange).toBe(false);
  });

  test("clamps outside 40 to 65 dB", () => {
    expect(roadTrafficDisturbance(80)).toEqual({
      ...roadTrafficDisturbance(65),
      outOfRange: true,
    });
    expect(roadTrafficDisturbance(30).outOfRange).toBe(true);
  });
});

describe("energyAverageDb", () => {
  test("is louder than the arithmetic mean", () => {
    expect(energyAverageDb([40, 60])).toBeCloseTo(57.03, 2);
  });

  test("equals the level when constant", () => {
    expect(energyAverageDb([50, 50, 50])).toBeCloseTo(50, 10);
  });
});

describe("isNightTime", () => {
  test("uses London time across BST", () => {
    expect(isNightTime(new Date("2026-07-01T22:30:00Z"))).toBe(true); // 23:30 BST
    expect(isNightTime(new Date("2026-07-01T06:30:00Z"))).toBe(false); // 07:30 BST
    expect(isNightTime(new Date("2026-11-14T06:59:00Z"))).toBe(true); // 06:59 GMT
  });
});

describe("isOutsideConstructionHours", () => {
  const none = new Set<string>();

  test("weekday limits are 08:00 to 18:00", () => {
    expect(isOutsideConstructionHours(new Date("2026-11-16T06:41:00Z"), none)).toBe(true);
    expect(isOutsideConstructionHours(new Date("2026-11-16T08:00:00Z"), none)).toBe(false);
    expect(isOutsideConstructionHours(new Date("2026-11-16T18:00:00Z"), none)).toBe(true);
  });

  test("Saturday ends at 13:00 and Sunday allows none", () => {
    expect(isOutsideConstructionHours(new Date("2026-11-14T12:59:00Z"), none)).toBe(false);
    expect(isOutsideConstructionHours(new Date("2026-11-14T13:00:00Z"), none)).toBe(true);
    expect(isOutsideConstructionHours(new Date("2026-11-15T10:00:00Z"), none)).toBe(true);
  });

  test("bank holidays allow none", () => {
    const xmas = new Set(["2026-12-25"]);
    expect(isOutsideConstructionHours(new Date("2026-12-25T10:00:00Z"), xmas)).toBe(true);
  });
});
