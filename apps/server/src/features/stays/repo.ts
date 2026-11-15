import type { AnyBulkWriteOperation, Collection, Document } from "mongodb";
import { mongo } from "../../db/mongo";

/** Mongo collections from docs/ARCHITECTURE.md. Both carry a 2dsphere index on `location`. */
export const HOTELS_COLLECTION = "hotels";
export const VENUES_COLLECTION = "venues";

export type GeoPoint = { type: "Point"; coordinates: [number, number] };

/** Never a real booking. Revenue is shown as the model (docs/DECISIONS.md). */
export type PlaceholderBookingLink = {
  url: string;
  placeholder: true;
  label: string;
};

type OsmFields = {
  /** OSM id, `node/123`, `way/123` or `relation/123`. */
  _id: string;
  name: string | null;
  location: GeoPoint;
  /** The OSM tourism or amenity value, e.g. `hotel`, `pub`, `museum`. */
  category: string;
  tags: Record<string, string>;
  updatedAt: Date;
};

export type HotelDocument = OsmFields & { bookingLink: PlaceholderBookingLink };
export type VenueDocument = OsmFields & { venueKind: "nightlife" | "sight" };

export type StaysRepo = {
  /** Upserts by OSM id. Fields other features add to a document are left alone. */
  upsertHotels(hotels: HotelDocument[]): Promise<void>;
  upsertVenues(venues: VenueDocument[]): Promise<void>;
  /** Newest `updatedAt` across hotels and venues, or null when both are empty. */
  lastImportAt(): Promise<Date | null>;
};

function upsertOps<T extends OsmFields>(docs: readonly T[]): AnyBulkWriteOperation<T>[] {
  return docs.map((doc) => {
    const { _id, ...fields } = doc;
    return {
      updateOne: {
        filter: { _id } as never,
        update: { $set: fields } as never,
        upsert: true,
      },
    };
  });
}

async function newest(collection: Collection<OsmFields>): Promise<Date | null> {
  const doc = await collection.find({}).sort({ updatedAt: -1 }).limit(1).next();
  return doc?.updatedAt ?? null;
}

export function createStaysRepo(): StaysRepo {
  const db = mongo();
  const hotels = db.collection<HotelDocument>(HOTELS_COLLECTION);
  const venues = db.collection<VenueDocument>(VENUES_COLLECTION);

  return {
    async upsertHotels(docs) {
      if (docs.length > 0) await hotels.bulkWrite(upsertOps(docs));
    },
    async upsertVenues(docs) {
      if (docs.length > 0) await venues.bulkWrite(upsertOps(docs));
    },
    async lastImportAt() {
      const [a, b] = await Promise.all([
        newest(hotels as unknown as Collection<OsmFields>),
        newest(venues as unknown as Collection<OsmFields>),
      ]);
      if (!a || !b) return a ?? b;
      return a > b ? a : b;
    },
  };
}

type Near = { distanceM: number };

/** One hotel from the ranking pipeline, with everything the lookups found around it. */
export type RankRow = {
  _id: string;
  name: string | null;
  location: GeoPoint;
  bookingLink: PlaceholderBookingLink;
  /** Metres from the `$geoNear` origin: the `near` point, else the city centre. */
  distanceFromOriginM: number;
  sensors: Array<Near & { _id: string; lnight30: number }>;
  works: Array<
    Near & {
      permitReferenceNumber: string;
      proposedStart: { date: string | null; time: string | null };
      proposedEnd: { date: string | null; time: string | null };
      actualStart: string | null;
      actualEnd: string | null;
      trafficManagementType: string;
      currentTrafficManagementType: string | null;
      nightWork: boolean;
      simulated: boolean;
    }
  >;
  venues: Array<Near & { venueKind: "nightlife" | "sight" }>;
  nights: Array<{ _id: string }>;
};

export type RankRepo = {
  aggregate(pipeline: Document[]): Promise<RankRow[]>;
  /** The query planner output for the pipeline, to show the 2dsphere index at work. */
  explain(pipeline: Document[]): Promise<Document>;
};

export function createRankRepo(): RankRepo {
  const hotels = () => mongo().collection<HotelDocument>(HOTELS_COLLECTION);
  return {
    async aggregate(pipeline) {
      return hotels().aggregate<RankRow>(pipeline).toArray();
    },
    async explain(pipeline) {
      return hotels().aggregate(pipeline).explain("queryPlanner");
    },
  };
}

/** True when the plan's `$geoNear` ran on the hotels' 2dsphere index. */
export function usesGeoIndex(explain: Document): boolean {
  const text = JSON.stringify(explain);
  return text.includes("GEO_NEAR_2DSPHERE") && text.includes("2dsphere");
}
