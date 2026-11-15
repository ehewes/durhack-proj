import { REAL_NIGHTS_RADIUS_M, WALKING_DISTANCE_M, WORKS_RADIUS_M } from "@kip/shared/domain";
import type { Document } from "mongodb";

/** Newcastle city centre, the `$geoNear` origin when the traveller names no point. */
export const NEWCASTLE_CENTRE: readonly [number, number] = [-1.614, 54.973];

/** Hotels further than this from the origin are not ranked. */
export const HOTEL_SEARCH_RADIUS_M = 5_000;
export const HOTEL_LIMIT = 100;

/** Observatory sensors count inside this radius, nearest weighing most. */
export const SENSOR_RADIUS_M = 1_500;

const EARTH_RADIUS_M = 6_378_100;

type RankPipelineParams = {
  near?: { lat: number; lon: number };
};

/** Great-circle metres between two `[lon, lat]` expressions (haversine). */
function distanceM(from: unknown, to: unknown): Document {
  const lat = (p: unknown) => ({ $degreesToRadians: { $arrayElemAt: [p, 1] } });
  const lon = (p: unknown) => ({ $degreesToRadians: { $arrayElemAt: [p, 0] } });
  const half = (x: unknown) => ({ $pow: [{ $sin: { $divide: [x, 2] } }, 2] });
  const a = {
    $add: [
      half({ $subtract: [lat(to), lat(from)] }),
      {
        $multiply: [
          { $cos: lat(from) },
          { $cos: lat(to) },
          half({ $subtract: [lon(to), lon(from)] }),
        ],
      },
    ],
  };
  return {
    $multiply: [2 * EARTH_RADIUS_M, { $atan2: [{ $sqrt: a }, { $sqrt: { $subtract: [1, a] } }] }],
  };
}

/**
 * A `$lookup` that keeps documents within `radiusM` of the hotel. MongoDB cannot pass a `let`
 * variable to `$geoWithin`/`$centerSphere`, so the sphere test is a haversine in `$expr`.
 * `where` is the document's `[lon, lat]` expression, `vertices` an array of them (works).
 */
function lookupWithin(options: {
  from: string;
  as: string;
  radiusM: number;
  match?: Document;
  where?: unknown;
  vertices?: unknown;
  project: Document;
}): Document {
  const distance = options.vertices
    ? {
        $min: {
          $map: {
            input: options.vertices,
            as: "vertex",
            in: distanceM("$$hotel", "$$vertex"),
          },
        },
      }
    : distanceM("$$hotel", options.where);
  return {
    $lookup: {
      from: options.from,
      let: { hotel: "$location.coordinates" },
      pipeline: [
        ...(options.match ? [{ $match: options.match }] : []),
        { $addFields: { distanceM: distance } },
        { $match: { distanceM: { $lte: options.radiusM } } },
        { $project: { ...options.project, distanceM: 1 } },
      ],
      as: options.as,
    },
  };
}

/**
 * The whole ranking in one aggregation. `$geoNear` is first (it must be, and only one is
 * allowed), then one `$lookup` per source: sensors, works within 200 m, venues within walking
 * distance, and opted-in nights within 300 m. Scoring with the shared weights happens after.
 */
export function buildRankPipeline(params: RankPipelineParams = {}): Document[] {
  const origin = params.near ? [params.near.lon, params.near.lat] : [...NEWCASTLE_CENTRE];
  return [
    {
      $geoNear: {
        near: { type: "Point", coordinates: origin },
        distanceField: "distanceFromOriginM",
        spherical: true,
        key: "location",
        maxDistance: HOTEL_SEARCH_RADIUS_M,
      },
    },
    { $limit: HOTEL_LIMIT },
    lookupWithin({
      from: "sensors",
      as: "sensors",
      radiusM: SENSOR_RADIUS_M,
      match: { lnight30: { $type: "number" } },
      where: "$location.coordinates",
      project: { lnight30: 1 },
    }),
    lookupWithin({
      from: "works",
      as: "works",
      radiusM: WORKS_RADIUS_M,
      match: { "geometry.type": { $in: ["Point", "LineString"] } },
      vertices: {
        $cond: [
          { $eq: ["$geometry.type", "Point"] },
          ["$geometry.coordinates"],
          "$geometry.coordinates",
        ],
      },
      project: {
        permitReferenceNumber: 1,
        proposedStart: 1,
        proposedEnd: 1,
        actualStart: 1,
        actualEnd: 1,
        trafficManagementType: 1,
        currentTrafficManagementType: 1,
        nightWork: 1,
        simulated: 1,
      },
    }),
    lookupWithin({
      from: "venues",
      as: "venues",
      radiusM: WALKING_DISTANCE_M,
      where: "$location.coordinates",
      project: { venueKind: 1 },
    }),
    lookupWithin({
      from: "nights",
      as: "nights",
      radiusM: REAL_NIGHTS_RADIUS_M,
      match: { "consent.location": true, "location.lat": { $type: "number" } },
      where: ["$location.lon", "$location.lat"],
      project: { _id: 1 },
    }),
    {
      $project: {
        name: 1,
        location: 1,
        bookingLink: 1,
        distanceFromOriginM: 1,
        sensors: 1,
        works: 1,
        venues: 1,
        nights: 1,
      },
    },
  ];
}
