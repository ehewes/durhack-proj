import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isInNightWindow, nightOf, WORKS_RADIUS_M } from "@kip/shared/domain";
import type { WorksNearItem } from "@kip/shared/works";
import lightSleeper from "../../../../../packages/shared/src/stays/fixtures/rank-light-sleeper.json";
import newcastleOverpass from "../../integrations/fixtures/newcastle-overpass.json";
import sample from "../../integrations/fixtures/street-manager/newcastle-permits.json";
import { parseOverpassPlaces } from "../../integrations/overpass";
import { createCallerFactory } from "../../trpc/init";
import { appRouter } from "../../trpc/router";
import demo from "./fixtures/demo-night-works.json";
import { distanceToWork, memoryWorksRepository, setWorksRepository } from "./repo";
import { samplePermitEvents, seedWorks } from "./seed";

const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_MS = 15 * 60 * 1000;

/** Nights of a stay, named by the evening's date: check-in up to the night before check-out. */
function stayNights(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  for (let at = Date.parse(`${checkIn}T12:00:00Z`); ; at += DAY_MS) {
    const date = new Date(at).toISOString().slice(0, 10);
    if (date >= checkOut) return nights;
    nights.push(date);
  }
}

/** Nights whose 23:00 to 07:00 London window the permit's proposed times reach. */
function scheduledNights(work: WorksNearItem): Set<string> {
  const nights = new Set<string>();
  const start = Date.parse(work.proposedStart.time ?? "");
  const end = Date.parse(work.proposedEnd.time ?? "");
  for (let at = start; at <= end; at += STEP_MS) {
    const instant = new Date(at);
    if (isInNightWindow(instant)) nights.add(nightOf(instant));
  }
  return nights;
}

describe.serial("seed:works", () => {
  let store = memoryWorksRepository();

  beforeEach(() => {
    store = memoryWorksRepository();
    setWorksRepository(store);
  });

  afterEach(() => {
    setWorksRepository(undefined);
  });

  test("stores every sample permit through the service, labelled simulated", async () => {
    const tally = await seedWorks();
    const works = store.all();
    expect(works).toHaveLength(samplePermitEvents().length);
    expect(works.every((work) => work.simulated)).toBe(true);
    expect(tally).toEqual({
      inserted: works.length,
      updated: 0,
      kept: 0,
      outsideNewcastle: 0,
      nightWork: works.filter((work) => work.nightWork).length,
    });
    const references = new Set(works.map((work) => work.permitReferenceNumber));
    for (const permit of sample.permits) expect(references.has(permit.object_reference)).toBe(true);
  });

  test("running it again replaces the same permits instead of adding more", async () => {
    await seedWorks();
    const again = await seedWorks();
    expect(store.all()).toHaveLength(samplePermitEvents().length);
    expect(again).toMatchObject({ inserted: 0, updated: samplePermitEvents().length, kept: 0 });
  });

  test("the demo hotel has night works on every night of the demo stay", async () => {
    await seedWorks();
    const hotel = parseOverpassPlaces(newcastleOverpass).find(
      (place) => place.id === demo.hotel.id,
    );
    if (!hotel) throw new Error(`${demo.hotel.id} is not in the Overpass fixture`);
    expect(hotel.kind).toBe("hotel");
    expect(hotel.name).toBe(demo.hotel.name);

    // The Quiet Stays demo stay. The demo permit was scheduled for these nights.
    const nights = stayNights(lightSleeper.checkIn, lightSleeper.checkOut);
    expect(nights).toEqual(["2026-11-20", "2026-11-21"]);
    const from = nights[0];
    const to = nights[nights.length - 1];
    if (!from || !to) throw new Error("stay nights");

    const caller = createCallerFactory(appRouter)({ userId: null });
    const { works } = await caller.works.near({
      lat: hotel.latitude,
      lon: hotel.longitude,
      radiusM: WORKS_RADIUS_M,
      from,
      to,
    });
    const everyNight = works.filter(
      (work) =>
        work.nightWork === "scheduled" && nights.every((night) => scheduledNights(work).has(night)),
    );
    expect(everyNight.map((work) => work.permitReferenceNumber)).toEqual(
      demo.permits.map((permit) => permit.object_reference),
    );
    for (const work of everyNight) {
      expect(work.simulated).toBe(true);
      // A point, so a $geoWithin $centerSphere lookup around the hotel matches it too.
      expect(work.geometry.type).toBe("Point");
      expect(distanceToWork(hotel.latitude, hotel.longitude, work)).toBeLessThan(WORKS_RADIUS_M);
    }
  });
});
