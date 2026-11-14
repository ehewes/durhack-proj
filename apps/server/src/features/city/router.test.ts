import { describe, expect, test } from "bun:test";
import { citySensors, type SensorLevel } from "@kip/shared/city";
import sensorsFixture from "../../../../../packages/shared/src/city/fixtures/city-sensors.json";
import { createCallerFactory } from "../../trpc/init";
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
