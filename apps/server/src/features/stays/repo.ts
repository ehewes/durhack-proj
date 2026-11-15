import type { AnyBulkWriteOperation, Collection, Document } from "mongodb";
import { mongo } from "../../db/mongo";
import { tiger } from "../../db/tiger";

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
  /** Sensors within range that report NO2 or PM2.5. Their night readings come from `nightAir`. */
  airSensors: Array<Near & { _id: string }>;
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
  /** Opted-in nights within 300 m. `simulated` marks the labelled simulated cohort. */
  nights: Array<{ _id: string; simulated?: boolean }>;
};

/** Mean night-time reading per sensor over the last 30 days, in µg/m³. A metric a sensor lacks is absent. */
export type SensorNightAir = { sensorId: string; no2?: number; pm25?: number };

/** Days of readings behind the night-time mean. */
export const NIGHT_AIR_DAYS = 30;

/** Mean NO2 and PM2.5 between 23:00 and 07:00 London time, per sensor. */
export const NIGHT_AIR_SQL = [
  "select sensor_id, metric, avg(value) as mean",
  "from sensor_readings",
  "where sensor_id = any($1) and metric in ('no2', 'pm25')",
  `and time >= now() - interval '${NIGHT_AIR_DAYS} days'`,
  "and (extract(hour from time at time zone 'Europe/London') >= 23",
  "or extract(hour from time at time zone 'Europe/London') < 7)",
  "group by sensor_id, metric",
].join(" ");

export type RankRepo = {
  aggregate(pipeline: Document[]): Promise<RankRow[]>;
  /** Night-time NO2 and PM2.5 for these Observatory sensors. */
  nightAir(sensorIds: string[]): Promise<SensorNightAir[]>;
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
    async nightAir(sensorIds) {
      if (sensorIds.length === 0) return [];
      const rows = (await tiger().unsafe(NIGHT_AIR_SQL, [sensorIds])) as unknown as Array<{
        sensor_id: string;
        metric: "no2" | "pm25";
        mean: number | string | null;
      }>;
      const bySensor = new Map<string, SensorNightAir>();
      for (const { sensor_id, metric, mean } of rows) {
        const value = Number(mean);
        if (mean === null || !Number.isFinite(value)) continue;
        const entry = bySensor.get(sensor_id) ?? { sensorId: sensor_id };
        entry[metric] = value;
        bySensor.set(sensor_id, entry);
      }
      return [...bySensor.values()];
    },
  };
}

/** True when the plan's `$geoNear` ran on the hotels' 2dsphere index. */
export function usesGeoIndex(explain: Document): boolean {
  const text = JSON.stringify(explain);
  return text.includes("GEO_NEAR_2DSPHERE") && text.includes("2dsphere");
}
