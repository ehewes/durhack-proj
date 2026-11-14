import { describe, expect, test } from "bun:test";
import { isOutsideRecommendedHours } from "./construction-hours";
import { energyAverageDb, MIN_NIGHTS_FOR_ESTIMATE } from "./lnight";
import { isInNightWindow, nightOf } from "./night-window";
import { roadTrafficDisturbance } from "./who-curve";

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

  test("clamps outside 40 to 65 dB, never extrapolates", () => {
    expect(roadTrafficDisturbance(80)).toEqual({ ...roadTrafficDisturbance(65), outOfRange: true });
    expect(roadTrafficDisturbance(30)).toEqual({ ...roadTrafficDisturbance(40), outOfRange: true });
  });
});

describe("energyAverageDb", () => {
  test("is the energy average, louder than the arithmetic mean", () => {
    expect(energyAverageDb([40, 60])).toBeCloseTo(57.03, 2);
  });

  test("equals the level when constant", () => {
    expect(energyAverageDb([50, 50, 50])).toBeCloseTo(50, 10);
  });

  test("needs 30 nights for a city estimate", () => {
    expect(MIN_NIGHTS_FOR_ESTIMATE).toBe(30);
  });
});

describe("night window", () => {
  test("runs 23:00 to 07:00 London time in GMT and BST", () => {
    expect(isInNightWindow(new Date("2026-07-01T22:30:00Z"))).toBe(true); // 23:30 BST
    expect(isInNightWindow(new Date("2026-07-01T06:30:00Z"))).toBe(false); // 07:30 BST
    expect(isInNightWindow(new Date("2026-11-14T06:59:00Z"))).toBe(true); // 06:59 GMT
  });

  test("handles the night the clocks go back (25 Oct 2026)", () => {
    // Starts 23:00 BST (22:00Z), ends 07:00 GMT (07:00Z): nine hours long
    expect(isInNightWindow(new Date("2026-10-24T21:59:00Z"))).toBe(false);
    expect(isInNightWindow(new Date("2026-10-24T22:00:00Z"))).toBe(true);
    expect(isInNightWindow(new Date("2026-10-25T06:59:00Z"))).toBe(true);
    expect(isInNightWindow(new Date("2026-10-25T07:00:00Z"))).toBe(false);
    expect(nightOf(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-24");
  });

  test("handles the night the clocks go forward (29 Mar 2026)", () => {
    // Starts 23:00 GMT (23:00Z), ends 07:00 BST (06:00Z): seven hours long
    expect(isInNightWindow(new Date("2026-03-28T23:00:00Z"))).toBe(true);
    expect(isInNightWindow(new Date("2026-03-29T05:59:00Z"))).toBe(true);
    expect(isInNightWindow(new Date("2026-03-29T06:00:00Z"))).toBe(false);
  });

  test("names a night by its evening", () => {
    expect(nightOf(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-14");
    expect(nightOf(new Date("2026-11-15T02:00:00Z"))).toBe("2026-11-14");
    expect(nightOf(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12-31");
  });
});

describe("isOutsideRecommendedHours", () => {
  test("weekday 06:41 is outside; 08:00 to 18:00 is inside", () => {
    expect(isOutsideRecommendedHours(new Date("2026-11-16T06:41:00Z"))).toBe(true);
    expect(isOutsideRecommendedHours(new Date("2026-11-16T08:00:00Z"))).toBe(false);
    expect(isOutsideRecommendedHours(new Date("2026-11-16T18:00:00Z"))).toBe(true);
  });

  test("Saturday 13:30 is outside; Sunday allows none", () => {
    expect(isOutsideRecommendedHours(new Date("2026-11-14T12:59:00Z"))).toBe(false);
    expect(isOutsideRecommendedHours(new Date("2026-11-14T13:30:00Z"))).toBe(true);
    expect(isOutsideRecommendedHours(new Date("2026-11-15T10:00:00Z"))).toBe(true);
  });

  test("bank holidays from the snapshot allow none", () => {
    expect(isOutsideRecommendedHours(new Date("2026-12-25T10:00:00Z"))).toBe(true);
    expect(isOutsideRecommendedHours(new Date("2026-08-31T10:00:00Z"))).toBe(true);
  });

  test("uses BST: 07:30Z on a summer Monday is 08:30 local, inside", () => {
    expect(isOutsideRecommendedHours(new Date("2026-03-30T07:30:00Z"))).toBe(false);
    expect(isOutsideRecommendedHours(new Date("2026-03-27T07:30:00Z"))).toBe(true); // GMT
  });
});
