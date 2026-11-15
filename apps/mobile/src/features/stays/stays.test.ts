import { describe, expect, test } from "bun:test";
import { rankSamples } from "./data/fixture";
import {
  addDays,
  breakdownRows,
  hotelFeatures,
  rankInputFor,
  resolveSelection,
  sampleRank,
  worksPenalty,
} from "./model";

const light = rankSamples.lightSleeper.hotels;
const first = light[0];
if (!first) throw new Error("fixture has no hotels");

describe("rankInputFor", () => {
  test("derives check-out from nights and keeps at least one night", () => {
    expect(rankInputFor("nightOut", "2026-11-30", 2).checkOut).toBe("2026-12-02");
    expect(rankInputFor("nightOut", "2026-11-30", 0).checkOut).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("resolveSelection", () => {
  test("drops a selection that is not in the current result", () => {
    expect(resolveSelection(light, first.hotelId)).toBe(first.hotelId);
    expect(resolveSelection(light, "not-a-hotel")).toBeNull();
    expect(resolveSelection([], first.hotelId)).toBeNull();
    expect(resolveSelection(light, null)).toBeNull();
  });
});

describe("hotelFeatures", () => {
  test("one point per hotel, keyed by hotel id, [lon, lat]", () => {
    const { features } = hotelFeatures(light);
    expect(features.map((f) => f.id)).toEqual(light.map((h) => h.hotelId));
    expect(features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [first.location.lon, first.location.lat],
    });
  });
});

describe("worksPenalty", () => {
  test("is hidden without an overlapping permit and shown with one", () => {
    expect(worksPenalty(first)).toBeNull();
    const withPermit = {
      ...first,
      breakdown: { ...first.breakdown, roadworks: { value: 50, weight: 0.2, points: 10 } },
      sources: {
        ...first.sources,
        permits: [{ ref: "P1", distanceM: 80, overlapsStay: true, nightWork: false }],
      },
    };
    expect(worksPenalty(withPermit)).toEqual({ points: 10, permits: 1 });
    const outside = {
      ...withPermit,
      sources: {
        ...withPermit.sources,
        permits: [{ ref: "P1", distanceM: 80, overlapsStay: false, nightWork: false }],
      },
    };
    expect(worksPenalty(outside)).toBeNull();
  });
});

describe("breakdownRows", () => {
  test("leaves out inputs the profile does not weigh", () => {
    const keys = breakdownRows(first).map((r) => r.key);
    expect(keys).not.toContain("nightlife");
    expect(keys).toContain("noise");
  });
});

describe("sampleRank", () => {
  const dates = { checkIn: "2026-12-01", checkOut: "2026-12-03" };
  test("each profile returns a sorted list with the asked dates", () => {
    for (const profile of ["lightSleeper", "nightOut", "bestValue", "business"] as const) {
      const { result } = sampleRank({ profile, ...dates }, rankSamples);
      expect(result.profile).toBe(profile);
      expect(result.checkIn).toBe(dates.checkIn);
      const scores = result.hotels.map((h) => h.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(result.hotels.every((h) => h.estimate === true)).toBe(true);
    }
  });

  test("switching profile changes the order", () => {
    const a = sampleRank({ profile: "lightSleeper", ...dates }, rankSamples).result.hotels;
    const b = sampleRank({ profile: "nightOut", ...dates }, rankSamples).result.hotels;
    expect(a.map((h) => h.hotelId)).not.toEqual(b.map((h) => h.hotelId));
  });

  test("only business flags the missing station", () => {
    expect(sampleRank({ profile: "business", ...dates }, rankSamples).leavesOutStation).toBe(true);
    expect(sampleRank({ profile: "bestValue", ...dates }, rankSamples).leavesOutStation).toBe(
      false,
    );
  });
});
