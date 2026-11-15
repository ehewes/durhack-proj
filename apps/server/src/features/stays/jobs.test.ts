import { describe, expect, test } from "bun:test";
import newcastleOverpass from "../../integrations/fixtures/newcastle-overpass.json";
import { parseOverpassPlaces } from "../../integrations/overpass";
import {
  importNewcastlePlaces,
  jobs,
  PLACEHOLDER_BOOKING_BASE,
  REFRESH_INTERVAL_MS,
  refreshIfStale,
  toDocuments,
} from "./jobs";
import type { HotelDocument, StaysRepo, VenueDocument } from "./repo";

const places = parseOverpassPlaces(newcastleOverpass);
const now = new Date("2026-11-14T12:00:00Z");

function fakeRepo(last: Date | null = null) {
  const hotels = new Map<string, HotelDocument>();
  const venues = new Map<string, VenueDocument>();
  const repo: StaysRepo = {
    async upsertHotels(docs) {
      for (const d of docs) hotels.set(d._id, d);
    },
    async upsertVenues(docs) {
      for (const d of docs) venues.set(d._id, d);
    },
    async lastImportAt() {
      return last;
    },
  };
  return { repo, hotels, venues };
}

describe("toDocuments", () => {
  const { hotels, venues } = toDocuments(places, now);

  test("splits the fixture into hotels and venues, dropping the station", () => {
    expect(hotels.length).toBe(places.filter((p) => p.kind === "hotel").length);
    expect(venues.length).toBe(
      places.filter((p) => p.kind === "nightlife" || p.kind === "sight").length,
    );
    expect(hotels.length).toBeGreaterThan(0);
    expect(venues.length).toBeGreaterThan(0);
  });

  test("stores GeoJSON points as [longitude, latitude]", () => {
    for (const doc of [...hotels, ...venues]) {
      const [lon, lat] = doc.location.coordinates;
      expect(doc.location.type).toBe("Point");
      expect(lat).toBeGreaterThan(54);
      expect(lon).toBeLessThan(-1);
    }
  });

  test("every hotel has a labelled placeholder booking link", () => {
    for (const hotel of hotels) {
      expect(hotel.bookingLink.placeholder).toBe(true);
      expect(hotel.bookingLink.label.toLowerCase()).toContain("placeholder");
      expect(hotel.bookingLink.url).toBe(`${PLACEHOLDER_BOOKING_BASE}${hotel._id}`);
    }
  });
});

describe("importNewcastlePlaces", () => {
  test("upserts by OSM id, so a second run adds nothing", async () => {
    const { repo, hotels, venues } = fakeRepo();
    const fetchPlaces = async () => places;
    await importNewcastlePlaces({ repo, fetchPlaces, now });
    const counts = [hotels.size, venues.size];
    await importNewcastlePlaces({ repo, fetchPlaces, now });
    expect([hotels.size, venues.size]).toEqual(counts);
    expect(counts[0]).toBeGreaterThan(0);
  });

  test("passes an Overpass failure through", async () => {
    const { repo } = fakeRepo();
    const fetchPlaces = async (): Promise<never> => {
      throw new Error("Overpass responded 429");
    };
    await expect(importNewcastlePlaces({ repo, fetchPlaces, now })).rejects.toThrow("429");
  });
});

describe("refreshIfStale", () => {
  const fetchPlaces = async () => places;

  test("imports on first boot", async () => {
    const { repo, hotels } = fakeRepo(null);
    expect(await refreshIfStale({ repo, fetchPlaces, now })).not.toBeNull();
    expect(hotels.size).toBeGreaterThan(0);
  });

  test("skips when the last import is under a day old", async () => {
    const { repo, hotels } = fakeRepo(new Date(now.getTime() - REFRESH_INTERVAL_MS + 60_000));
    expect(await refreshIfStale({ repo, fetchPlaces, now })).toBeNull();
    expect(hotels.size).toBe(0);
  });

  test("imports again after a day", async () => {
    const { repo } = fakeRepo(new Date(now.getTime() - REFRESH_INTERVAL_MS));
    expect(await refreshIfStale({ repo, fetchPlaces, now })).not.toBeNull();
  });
});

test("registers the stays.osm job", () => {
  expect(jobs.map((j) => j.name)).toEqual(["stays.osm"]);
});
