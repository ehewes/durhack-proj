import { describe, expect, test } from "bun:test";
import type { WorksNearItem } from "@kip/shared/works";
import { NIGHT_NOTE } from "./copy";
import {
  describeWork,
  formatWhen,
  permitRefOfFeature,
  representativePoint,
  worksFeatures,
} from "./model";

const line: WorksNearItem = {
  permitReferenceNumber: "P-1",
  workReferenceNumber: "W-1",
  streetName: "Grey Street",
  highwayAuthority: "Newcastle City Council",
  workCategory: "Standard",
  workStatus: "in_progress",
  geometry: {
    type: "LineString",
    coordinates: [
      [-1.61, 54.97],
      [-1.611, 54.971],
      [-1.612, 54.972],
    ],
  },
  precision: "extent",
  proposedStart: { date: "2026-07-01", time: "2026-07-01T22:00:00Z" },
  proposedEnd: { date: "2026-07-03", time: null },
  actualStart: null,
  actualEnd: null,
  nightWork: "scheduled",
  simulated: false,
};

const point: WorksNearItem = {
  ...line,
  permitReferenceNumber: "P-2",
  geometry: { type: "Point", coordinates: [-1.6, 54.98] },
  precision: "point",
  proposedStart: { date: null, time: null },
  proposedEnd: { date: null, time: null },
  nightWork: "unknown",
  simulated: true,
};

describe("worksFeatures", () => {
  test("keeps stored line geometry and a point as a point", () => {
    const { features } = worksFeatures([line, point]);
    expect(features.map((f) => [f.id, f.geometry.type])).toEqual([
      ["P-1", "LineString"],
      ["P-2", "Point"],
    ]);
  });
  test("adds an accent marker only for highlighted permits", () => {
    const { features } = worksFeatures([line, point], ["P-1", "missing"]);
    expect(features.map((f) => f.id)).toEqual(["P-1", "highlight:P-1", "P-2"]);
    expect(features[1]?.properties).toEqual({ color: "#2f5bd3" });
  });
  test("maps a highlight marker back to its permit", () => {
    expect(permitRefOfFeature("highlight:P-1")).toBe("P-1");
    expect(permitRefOfFeature("P-1")).toBe("P-1");
  });
});

describe("representativePoint", () => {
  test("uses the middle vertex of a line and the mean of a ring", () => {
    expect(representativePoint(line.geometry)).toEqual([-1.611, 54.971]);
    expect(
      representativePoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([1, 1]);
  });
});

describe("describeWork", () => {
  test("shows source, dates and scheduled night work for a line", () => {
    const details = describeWork(line);
    const values = Object.fromEntries(details.rows.map((r) => [r.label, r.value]));
    expect(values.Source).toBe("Street Manager permit P-1");
    expect(values["Proposed start"]).toBe("1 Jul 2026, 23:00");
    expect(values["Proposed end"]).toBe("3 Jul 2026");
    expect(values["Actual start"]).toBeUndefined();
    expect(values["Night work"]).toBe("Night work scheduled");
    expect(details.notes).toEqual([]);
  });
  test("states an unknown schedule and discloses an approximate, simulated point", () => {
    const details = describeWork(point);
    const values = Object.fromEntries(details.rows.map((r) => [r.label, r.value]));
    expect(values["Night work"]).toBe("Schedule unknown");
    expect(values["Proposed start"]).toBeUndefined();
    expect(details.notes).toEqual([
      "Approximate location. The permit gives one point, not the extent of the works.",
      "Simulated sample permit",
    ]);
  });
  test("keeps scheduled night work apart from observed sound", () => {
    expect(NIGHT_NOTE).toContain("separate observation");
    expect(NIGHT_NOTE).toContain("recommended hours");
  });
});

describe("formatWhen", () => {
  test("is null with no date and no time", () => {
    expect(formatWhen({ date: null, time: null })).toBeNull();
  });
});
