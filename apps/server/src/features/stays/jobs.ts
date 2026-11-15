import { type OsmPlace, queryNewcastlePlaces } from "../../integrations/overpass";
import type { Job } from "../../jobs";
import {
  createStaysRepo,
  type HotelDocument,
  type PlaceholderBookingLink,
  type StaysRepo,
  type VenueDocument,
} from "./repo";

/** The OSM data moves slowly. Once a day is plenty and kind to the public Overpass server. */
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** example.com is reserved, so this link can never reach a real booking page. */
export const PLACEHOLDER_BOOKING_BASE = "https://example.com/kip-placeholder-booking/";

export function placeholderBookingLink(osmId: string): PlaceholderBookingLink {
  return {
    url: `${PLACEHOLDER_BOOKING_BASE}${osmId}`,
    placeholder: true,
    label: "Placeholder booking link, not a real booking",
  };
}

function base(place: OsmPlace, now: Date) {
  return {
    _id: place.id,
    name: place.name || null,
    location: {
      type: "Point" as const,
      coordinates: [place.longitude, place.latitude] as [number, number],
    },
    category: place.tags.tourism ?? place.tags.amenity ?? "",
    tags: place.tags,
    updatedAt: now,
  };
}

export type StaysImport = { hotels: HotelDocument[]; venues: VenueDocument[] };

/** Splits OSM places into hotels and venues (nightlife and sights). Stations are not stored. */
export function toDocuments(places: readonly OsmPlace[], now: Date): StaysImport {
  const hotels: HotelDocument[] = [];
  const venues: VenueDocument[] = [];
  for (const place of places) {
    if (place.kind === "hotel") {
      hotels.push({ ...base(place, now), bookingLink: placeholderBookingLink(place.id) });
    } else if (place.kind === "nightlife" || place.kind === "sight") {
      venues.push({ ...base(place, now), venueKind: place.kind });
    }
  }
  return { hotels, venues };
}

type ImportDeps = {
  repo: StaysRepo;
  fetchPlaces?: () => Promise<OsmPlace[]>;
  now?: Date;
};

/** Fetches Newcastle from Overpass once and upserts it. Safe to repeat. */
export async function importNewcastlePlaces(deps: ImportDeps): Promise<StaysImport> {
  const now = deps.now ?? new Date();
  const places = await (deps.fetchPlaces ?? (() => queryNewcastlePlaces()))();
  const docs = toDocuments(places, now);
  await deps.repo.upsertHotels(docs.hotels);
  await deps.repo.upsertVenues(docs.venues);
  return docs;
}

/**
 * Imports when nothing is stored yet or the last import is a day old.
 * The worker has no boot hook, so a frequent schedule plus this check
 * means the first run lands within minutes of boot and then daily.
 */
export async function refreshIfStale(deps: ImportDeps): Promise<StaysImport | null> {
  const now = deps.now ?? new Date();
  const last = await deps.repo.lastImportAt();
  if (last && now.getTime() - last.getTime() < REFRESH_INTERVAL_MS) return null;
  return importNewcastlePlaces({ ...deps, now });
}

export const jobs: Job[] = [
  {
    name: "stays.osm",
    schedule: "*/5 * * * *",
    run: async () => {
      const imported = await refreshIfStale({ repo: createStaysRepo() });
      if (imported) {
        console.log(
          `stays.osm stored ${imported.hotels.length} hotels and ${imported.venues.length} venues`,
        );
      }
    },
  },
];
