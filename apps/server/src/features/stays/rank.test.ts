import { describe, expect, test } from "bun:test";
import { rankResult } from "@kip/shared/stays";
import { buildRankPipeline, HOTEL_LIMIT } from "./pipeline";
import type { RankRepo, RankRow, SensorNightAir } from "./repo";
import { explainRank, rank, stayNights, weightedAir, weightedLnight } from "./service";

describe("buildRankPipeline", () => {
  const pipeline = buildRankPipeline({ near: { lat: 54.97, lon: -1.617 } });

  test("starts with the only $geoNear, on hotels, at [lon, lat]", () => {
    expect(Object.keys(pipeline[0] ?? {})).toEqual(["$geoNear"]);
    expect(pipeline.filter((s) => "$geoNear" in s)).toHaveLength(1);
    expect(pipeline[0]?.$geoNear).toMatchObject({
      near: { type: "Point", coordinates: [-1.617, 54.97] },
      spherical: true,
      key: "location",
    });
    expect(pipeline[1]).toEqual({ $limit: HOTEL_LIMIT });
  });

  test("defaults the origin to the city centre", () => {
    expect(buildRankPipeline()[0]?.$geoNear.near.coordinates).toEqual([-1.614, 54.973]);
  });

  test("looks up noise sensors, air sensors, works, venues and nights, in that order", () => {
    const lookups = pipeline.flatMap((s) => (s.$lookup ? [s.$lookup] : []));
    expect(lookups.map((l) => l.from)).toEqual(["sensors", "sensors", "works", "venues", "nights"]);
  });

  test("keeps works within 200 m, venues within 800 m and nights within 300 m", () => {
    const radius = (from: string) => {
      const lookup = pipeline.find((s) => s.$lookup?.from === from)?.$lookup;
      const match = lookup.pipeline.find((s: Record<string, unknown>) => {
        const m = s.$match as Record<string, unknown> | undefined;
        return m && "distanceM" in m;
      });
      return match.$match.distanceM.$lte;
    };
    expect(radius("works")).toBe(200);
    expect(radius("venues")).toBe(800);
    expect(radius("nights")).toBe(300);
  });
});

describe("stayNights", () => {
  test("lists check-in to the night before check-out", () => {
    expect(stayNights("2026-11-20", "2026-11-23")).toEqual([
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });
});

test("weightedLnight leans on the nearer sensor and falls back with none", () => {
  const near = weightedLnight([
    { _id: "a", lnight30: 50, distanceM: 100 },
    { _id: "b", lnight30: 60, distanceM: 1000 },
  ]);
  expect(near).toBeGreaterThan(50);
  expect(near).toBeLessThan(55);
  expect(weightedLnight([])).toBe(55);
});

function row(id: string, over: Partial<RankRow>): RankRow {
  return {
    _id: id,
    name: id,
    location: { type: "Point", coordinates: [-1.61, 54.97] },
    bookingLink: { url: `https://example.com/p/${id}`, placeholder: true, label: "placeholder" },
    distanceFromOriginM: 400,
    sensors: [{ _id: "s1", lnight30: 52, distanceM: 200 }],
    airSensors: [],
    works: [],
    venues: [],
    nights: [],
    ...over,
  };
}

const quietButRoadworks = row("works", {
  works: [
    {
      distanceM: 80,
      permitReferenceNumber: "P-1",
      proposedStart: { date: "2026-11-01", time: "2026-11-01T22:00:00Z" },
      proposedEnd: { date: "2026-12-01", time: "2026-12-01T05:00:00Z" },
      actualStart: null,
      actualEnd: null,
      trafficManagementType: "Road closure",
      currentTrafficManagementType: null,
      nightWork: true,
      simulated: true,
    },
  ],
});
const quietClear = row("clear", {});
const nightlifeHotel = row("bars", {
  sensors: [{ _id: "s2", lnight30: 62, distanceM: 150 }],
  venues: [{ venueKind: "nightlife", distanceM: 60 }],
});

function fakeRepo(rows: RankRow[], air: SensorNightAir[] = []): RankRepo {
  return {
    aggregate: async () => rows,
    nightAir: async () => air,
    explain: async () => ({
      stages: [{ $cursor: { queryPlanner: { winningPlan: { stage: "GEO_NEAR_2DSPHERE" } } } }],
      indexName: "location_2dsphere",
    }),
  };
}

const stay = { checkIn: "2026-11-20", checkOut: "2026-11-22" };

describe("rank", () => {
  const repo = fakeRepo([quietButRoadworks, nightlifeHotel, quietClear]);

  test("a light sleeper gets the clear quiet hotel first, with valid output", async () => {
    const result = await rank({ profile: "lightSleeper", ...stay }, repo);
    expect(rankResult.safeParse(result).success).toBe(true);
    expect(result.hotels.map((h) => h.hotelId)).toEqual(["clear", "works", "bars"]);
  });

  test("switching to night out puts the hotel by the bars ahead of the works hotel", async () => {
    const sleeper = await rank({ profile: "lightSleeper", ...stay }, repo);
    const night = await rank({ profile: "nightOut", ...stay }, repo);
    const order = (r: typeof sleeper) => r.hotels.map((h) => h.hotelId);
    expect(order(night)).not.toEqual(order(sleeper));
    expect(order(night).indexOf("bars")).toBeLessThan(order(sleeper).indexOf("bars"));
  });

  test("lists sources and flags simulated permits and the night work", async () => {
    const result = await rank({ profile: "lightSleeper", ...stay }, repo);
    const hotel = result.hotels.find((h) => h.hotelId === "works");
    expect(hotel?.sources.sensors).toEqual([{ id: "s1", distanceM: 200 }]);
    expect(hotel?.sources.permits).toEqual([
      { ref: "P-1", distanceM: 80, overlapsStay: true, nightWork: true },
    ]);
    expect(hotel?.simulated).toBe(true);
    expect(hotel?.breakdown.roadworks.value).toBeLessThan(100);
    expect(hotel?.estimate).toBe(true);
  });

  test("labels nearby nights simulated when any of them are", async () => {
    const mixed = row("mixed", { nights: [{ _id: "n1" }, { _id: "n2", simulated: true }] });
    const real = row("real", { nights: [{ _id: "n3" }] });
    const result = await rank({ profile: "lightSleeper", ...stay }, fakeRepo([mixed, real]));
    const sources = new Map(result.hotels.map((h) => [h.hotelId, h.sources.realNights]));
    expect(sources.get("mixed")).toEqual({ count: 2, simulated: true });
    expect(sources.get("real")).toEqual({ count: 1, simulated: false });
  });

  test("ignores a permit that ended before the stay", async () => {
    const past = row("past", {
      works: [
        {
          ...(quietButRoadworks.works[0] as RankRow["works"][number]),
          proposedStart: { date: "2026-10-01", time: "2026-10-01T22:00:00Z" },
          proposedEnd: { date: "2026-10-10", time: "2026-10-10T05:00:00Z" },
        },
      ],
    });
    const result = await rank({ profile: "lightSleeper", ...stay }, fakeRepo([past]));
    expect(result.hotels[0]?.sources.permits).toEqual([]);
    expect(result.hotels[0]?.breakdown.roadworks.value).toBe(100);
  });
});

test("explainRank reports the 2dsphere index", async () => {
  const explained = await explainRank({ profile: "lightSleeper", ...stay }, fakeRepo([]));
  expect(explained.usesGeoIndex).toBe(true);
});

describe("night air quality", () => {
  const dirty = row("dirty", { airSensors: [{ _id: "a1", distanceM: 100 }] });
  const clean = row("clean", { airSensors: [{ _id: "a2", distanceM: 100 }] });
  const unknown = row("unknown", {});
  const air: SensorNightAir[] = [
    { sensorId: "a1", no2: 60, pm25: 30 },
    { sensorId: "a2", no2: 10, pm25: 5 },
  ];

  test("weightedAir leans on the nearer sensor and leaves a missing metric undefined", () => {
    const readings = new Map([
      ["a", { sensorId: "a", no2: 20 }],
      ["b", { sensorId: "b", no2: 40, pm25: 10 }],
    ]);
    const result = weightedAir(
      [
        { _id: "a", distanceM: 100 },
        { _id: "b", distanceM: 1000 },
      ],
      readings,
    );
    expect(result?.no2).toBeGreaterThan(20);
    expect(result?.no2).toBeLessThan(25);
    expect(result?.pm25).toBe(10);
    expect(weightedAir([], readings)).toEqual({ no2: undefined, pm25: undefined });
  });

  test("a hotel by dirtier night air scores lower on the air factor and overall", async () => {
    const result = await rank({ profile: "lightSleeper", ...stay }, fakeRepo([dirty, clean], air));
    const by = new Map(result.hotels.map((h) => [h.hotelId, h]));
    expect(by.get("dirty")?.breakdown.airQuality.value).toBeLessThan(
      by.get("clean")?.breakdown.airQuality.value ?? 0,
    );
    expect(by.get("dirty")?.breakdown.airQuality.weight).toBeGreaterThan(0);
    expect(by.get("dirty")?.score).toBeLessThan(by.get("clean")?.score ?? 0);
  });

  test("no reading near a hotel is not a penalty", async () => {
    const result = await rank({ profile: "lightSleeper", ...stay }, fakeRepo([unknown], air));
    expect(result.hotels[0]?.breakdown.airQuality.value).toBe(100);
  });
});
