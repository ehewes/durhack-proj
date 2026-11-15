import { describe, expect, test } from "bun:test";
import {
  COVERAGE_MIN_PEOPLE,
  type CoveragePoint,
  cellOf,
  cityCoverage,
  coverageFrom,
  coverageSince,
} from "./coverage";

// Grey's Monument, and points a few metres away in the same cell.
const LAT = 54.9746;
const LON = -1.6132;
const M_LAT = 1 / 111_320;

const person = (userId: string, dLatM = 0, simulated = false): CoveragePoint => ({
  userId,
  lat: LAT + dLatM * M_LAT,
  lon: LON,
  simulated,
});

describe("coverage grid", () => {
  test("nearby points share a cell, and the cell's centre is not any of them", () => {
    const a = cellOf(LAT, LON);
    const b = cellOf(LAT + 20 * M_LAT, LON);
    expect(b.key).toBe(a.key);
    expect(a.lat === LAT || a.lon === LON).toBe(false);
    expect(cellOf(LAT + 600 * M_LAT, LON).key === a.key).toBe(false);
  });

  test("counts 30 nights back from the current night", () => {
    expect(coverageSince(new Date("2026-11-15T09:00:00Z"))).toBe("2026-10-16");
  });
});

describe("coverage cells", () => {
  test("hides a cell's real people until 3 different people sensed there", () => {
    const two = coverageFrom([person("a"), person("a", 5), person("b", 10)]);
    expect(two.cells).toEqual([]);
    const three = coverageFrom([person("a"), person("b", 5), person("c", 10), person("c", 12)]);
    expect(three.cells).toHaveLength(1);
    expect(three.cells[0]?.people).toBe(COVERAGE_MIN_PEOPLE);
    expect(three.cells[0]?.simulatedPeople).toBe(0);
  });

  test("counts simulated people apart, so they never lift a real cell over the line", () => {
    const mixed = coverageFrom([person("a"), person("b", 5), person("s1", 8, true)]);
    expect(mixed.cells).toEqual([
      { lat: cellOf(LAT, LON).lat, lon: cellOf(LAT, LON).lon, people: 0, simulatedPeople: 1 },
    ]);
  });

  test("never returns an input location, skips bad ones, and parses as the payload", () => {
    const points = [
      person("a"),
      person("b", 5),
      person("c", 10),
      person("s1", 2000, true),
      { userId: "x", lat: Number.NaN, lon: LON, simulated: false },
    ];
    const coverage = cityCoverage.parse(coverageFrom(points));
    expect(coverage.cells).toHaveLength(2);
    const inputs = new Set(points.map((p) => `${p.lat},${p.lon}`));
    for (const cell of coverage.cells) expect(inputs.has(`${cell.lat},${cell.lon}`)).toBe(false);
    expect(coverage.cells.map((c) => c.lat)).toEqual([...coverage.cells.map((c) => c.lat)].sort());
  });
});
