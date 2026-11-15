import { describe, expect, test } from "bun:test";
import { citySensors, type SensorLevel } from "@kip/shared/city";
import { TRPCError } from "@trpc/server";
import sensorsFixture from "../../../../../packages/shared/src/city/fixtures/city-sensors.json";
import { createCallerFactory } from "../../trpc/init";
import { NightStorageError } from "../night";
import type { SensorDocument } from "./repo";
import { createCityRouter } from "./router";
import { listCitySensors } from "./service";

const fixture = citySensors.parse(sensorsFixture);

function documentFrom(level: SensorLevel): SensorDocument {
  return {
    _id: level.id,
    name: level.name,
    location: { type: "Point", coordinates: [level.lon, level.lat] },
    broker: "aq_mesh_api",
    heightAboveGround: null,
    metrics: ["noise_db"],
    updatedAt: new Date(level.updatedAt),
    lnight30: level.lnight30,
    pctHighlySleepDisturbed: level.pctHighlySleepDisturbed,
    nights: level.nights,
    outOfRange: level.outOfRange,
    notEnoughData: level.notEnoughData,
    indicative: true,
  };
}

function callerFor(docs: SensorDocument[]) {
  return createCallerFactory(
    createCityRouter(() => listCitySensors({ listSensors: async () => docs })),
  )({ userId: null });
}

describe("city.sensors", () => {
  test("returns the fixture from Mongo", async () => {
    const result = await callerFor(fixture.map(documentFrom).reverse()).sensors();
    expect(citySensors.parse(result)).toEqual(fixture);
    expect(result).toEqual(fixture);
  });

  test("a sensor with fewer than 30 nights is not enough data and unshaded", async () => {
    const updatedAt = new Date("2026-11-13T07:00:00.000Z");
    const result = await callerFor([
      {
        _id: "short",
        name: "Central Station",
        location: { type: "Point", coordinates: [-1.6176, 54.9685] },
        broker: "aq_mesh_api",
        heightAboveGround: null,
        metrics: ["noise_db"],
        updatedAt,
        lnight30: 66.8,
        pctHighlySleepDisturbed: 12,
        nights: 12,
        outOfRange: true,
        notEnoughData: false,
        indicative: true,
      },
    ]).sensors();
    expect(result).toEqual([
      {
        id: "short",
        name: "Central Station",
        lat: 54.9685,
        lon: -1.6176,
        lnight30: null,
        nights: 12,
        pctHighlySleepDisturbed: null,
        outOfRange: false,
        notEnoughData: true,
        indicative: true,
        updatedAt: updatedAt.toISOString(),
      },
    ]);
  });
});

describe("city.coverage", () => {
  const near = (userId: string, dLat: number, simulated = false) => ({
    userId,
    lat: 54.9746 + dLat / 111_320,
    lon: -1.6132,
    simulated,
  });
  const allows =
    (location: boolean, answered = true) =>
    async (userId: string) => ({
      userId,
      consent: { microphone: true, health: false, location },
      consentUpdatedAt: answered ? "2026-11-14T20:00:00+00:00" : null,
      profile: null,
    });

  test("returns rough cells from the last 30 nights, with real people hidden under 3", async () => {
    const asked: string[] = [];
    const caller = createCallerFactory(
      createCityRouter(
        async () => [],
        async (since) => {
          asked.push(since);
          return [near("a", 0), near("b", 5), near("c", 3000, true)];
        },
        allows(true),
      ),
    )({ userId: null });
    const coverage = await caller.coverage();
    expect(asked).toHaveLength(1);
    expect(coverage.minPeople).toBe(3);
    expect(coverage.cells).toHaveLength(1);
    expect(coverage.cells[0]).toMatchObject({ people: 0, simulatedPeople: 1 });
  });

  test("drops a user who has since turned location off, or never answered", async () => {
    const consent = new Map([
      ["a", true],
      ["b", true],
      ["c", true],
      ["d", false],
    ]);
    const looked: string[] = [];
    const caller = createCallerFactory(
      createCityRouter(
        async () => [],
        async () => [
          near("a", 0),
          near("a", 2),
          near("b", 5),
          near("c", 8),
          near("d", 10),
          near("e", 12),
          near("s", 3000, true),
        ],
        async (userId) => {
          looked.push(userId);
          if (userId === "e") return allows(true, false)(userId);
          return allows(consent.get(userId) ?? false)(userId);
        },
      ),
    )({ userId: null });
    const { cells } = await caller.coverage();
    expect(cells.map((c) => [c.people, c.simulatedPeople])).toEqual([
      [3, 0],
      [0, 1],
    ]);
    expect(looked.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("reuses one computed coverage for five minutes", async () => {
    let reads = 0;
    const caller = createCallerFactory(
      createCityRouter(
        async () => [],
        async () => {
          reads += 1;
          return [near("s", 0, true)];
        },
        allows(true),
      ),
    )({ userId: null });
    await caller.coverage();
    await caller.coverage();
    expect(reads).toBe(1);
  });

  test("a storage failure comes back as a clean server error", async () => {
    const caller = createCallerFactory(
      createCityRouter(
        async () => [],
        async () => {
          throw new NightStorageError("Could not read the night");
        },
        allows(true),
      ),
    )({ userId: null });
    const failure = await caller.coverage().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TRPCError);
    expect((failure as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
  });
});
