import { describe, expect, test } from "bun:test";
import { TRAVELLER_PROFILES } from "../domain";
import lightSleeperFixture from "./fixtures/rank-light-sleeper.json";
import nightOutFixture from "./fixtures/rank-night-out.json";
import { hotelScore, rankInput, rankResult, toGeoJsonPosition } from "./index";

describe("stays fixtures", () => {
  for (const [name, fixture, profile] of [
    ["light sleeper", lightSleeperFixture, "lightSleeper"],
    ["night out", nightOutFixture, "nightOut"],
  ] as const) {
    test(`${name} fixture is valid, ranked and labelled as an estimate`, () => {
      const result = rankResult.parse(fixture);
      expect(result.profile).toBe(profile);
      expect(result.hotels).toHaveLength(15);
      const scores = result.hotels.map((h) => h.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(result.hotels.every((h) => h.estimate === true)).toBe(true);
      expect(result.hotels.every((h) => Number.isFinite(h.location.lon))).toBe(true);
      const input = { profile, checkIn: result.checkIn, checkOut: result.checkOut };
      expect(rankInput.safeParse(input).success).toBe(true);
    });
  }

  test("profile names match the shared domain", () => {
    expect(TRAVELLER_PROFILES).toContain(rankResult.parse(nightOutFixture).profile);
  });
});

describe("rankInput", () => {
  test("accepts an optional near point as { lat, lon }", () => {
    const r = rankInput.safeParse({
      profile: "business",
      checkIn: "2026-11-20",
      checkOut: "2026-11-21",
      near: { lat: 54.97, lon: -1.617 },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.near).toEqual({ lat: 54.97, lon: -1.617 });
  });

  test("rejects the old lng field", () => {
    const r = rankInput.safeParse({
      profile: "business",
      checkIn: "2026-11-20",
      checkOut: "2026-11-21",
      near: { lat: 54.97, lng: -1.617 },
    });
    expect(r.success).toBe(false);
  });

  test("rejects checkOut on or before checkIn and unknown profiles", () => {
    const same = { profile: "lightSleeper", checkIn: "2026-11-20", checkOut: "2026-11-20" };
    expect(rankInput.safeParse(same).success).toBe(false);
    const unknown = { profile: "party", checkIn: "2026-11-20", checkOut: "2026-11-21" };
    expect(rankInput.safeParse(unknown).success).toBe(false);
  });
});

test("converts a Newcastle location to GeoJSON [longitude, latitude]", () => {
  expect(toGeoJsonPosition({ lat: 54.973, lon: -1.614 })).toEqual([-1.614, 54.973]);
  const biggMarket = rankResult.parse(lightSleeperFixture).hotels[0];
  if (!biggMarket) throw new Error("missing Bigg Market");
  expect(biggMarket).toMatchObject({
    name: "Bigg Market Hotel",
    bookingUrl: "https://example.com/book/osm-node-1010",
    location: { lat: 54.97, lon: -1.614 },
  });
  expect(toGeoJsonPosition(biggMarket.location)).toEqual([-1.614, 54.97]);
});

test("rejects swapped or out-of-range coordinates", () => {
  expect(() => toGeoJsonPosition({ lat: -1.614, lon: 54.973 })).toThrow(/swapped/);
  expect(() => toGeoJsonPosition({ lat: 91, lon: -1.614 })).toThrow();
  expect(() => toGeoJsonPosition({ lat: 54.973, lon: 181 })).toThrow();
  expect(() => toGeoJsonPosition({ lat: Number.NaN, lon: -1.614 })).toThrow();
});

test("hotelScore rejects estimate: false and scores above 100", () => {
  const base = rankResult.parse(lightSleeperFixture).hotels[0];
  expect(hotelScore.safeParse({ ...base, estimate: false }).success).toBe(false);
  expect(hotelScore.safeParse({ ...base, score: 101 }).success).toBe(false);
});
