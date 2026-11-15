// Business logic for `stays`. Other features may call only what index.ts re-exports from here.
import { type HotelScoreInputs, scoreHotel } from "@kip/shared/domain";
import type { RankInput, RankResult } from "@kip/shared/stays";
import { activeDates } from "@kip/shared/works";
import { buildRankPipeline } from "./pipeline";
import {
  createRankRepo,
  type RankRepo,
  type RankRow,
  type SensorNightAir,
  usesGeoIndex,
} from "./repo";

/** Lnight when no sensor is in range. The sources list is then empty, which the UI shows. */
export const FALLBACK_LNIGHT_DB = 55;

/** A sensor closer than this counts as this far, so one sensor next door cannot take all the weight. */
const MIN_SENSOR_DISTANCE_M = 50;

/** Each night of the stay, `checkIn` inclusive and `checkOut` exclusive, as YYYY-MM-DD. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  for (let t = Date.parse(`${checkIn}T00:00:00Z`); t < end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/** Inverse-distance weighted mean of the sensors' 30-night Lnight. */
export function weightedLnight(sensors: RankRow["sensors"]): number {
  let sum = 0;
  let weights = 0;
  for (const sensor of sensors) {
    const weight = 1 / Math.max(sensor.distanceM, MIN_SENSOR_DISTANCE_M);
    sum += sensor.lnight30 * weight;
    weights += weight;
  }
  return weights > 0 ? sum / weights : FALLBACK_LNIGHT_DB;
}

/**
 * Inverse-distance weighted night NO2 and PM2.5 from the air sensors in range. A metric no
 * sensor reports stays undefined, which the score does not penalise.
 */
export function weightedAir(
  sensors: RankRow["airSensors"],
  readings: ReadonlyMap<string, SensorNightAir>,
): HotelScoreInputs["airQuality"] {
  const sums = { no2: { sum: 0, weights: 0 }, pm25: { sum: 0, weights: 0 } };
  for (const sensor of sensors) {
    const reading = readings.get(sensor._id);
    if (!reading) continue;
    const weight = 1 / Math.max(sensor.distanceM, MIN_SENSOR_DISTANCE_M);
    for (const metric of ["no2", "pm25"] as const) {
      const value = reading[metric];
      if (value === undefined) continue;
      sums[metric].sum += value * weight;
      sums[metric].weights += weight;
    }
  }
  const mean = ({ sum, weights }: { sum: number; weights: number }) =>
    weights > 0 ? sum / weights : undefined;
  return { no2: mean(sums.no2), pm25: mean(sums.pm25) };
}

function nearest(venues: RankRow["venues"], kind: "nightlife" | "sight"): number | undefined {
  const distances = venues.filter((v) => v.venueKind === kind).map((v) => v.distanceM);
  return distances.length > 0 ? Math.min(...distances) : undefined;
}

function rowToScore(
  row: RankRow,
  input: RankInput,
  stayDates: string[],
  air: ReadonlyMap<string, SensorNightAir>,
) {
  const works = row.works.flatMap((work) => {
    const span = activeDates(work);
    if (!span) return [];
    const dates = stayDates.filter((d) => d >= span.start && (span.end === null || d <= span.end));
    if (dates.length === 0) return [];
    return [{ work, distanceM: work.distanceM, activeDates: dates, nightWork: work.nightWork }];
  });
  const inputs: HotelScoreInputs = {
    lnightDb: weightedLnight(row.sensors),
    airQuality: weightedAir(row.airSensors ?? [], air),
    stayDates,
    works,
    nightlifeDistanceM: nearest(row.venues, "nightlife"),
    sightsDistanceM: nearest(row.venues, "sight"),
    // Hotels are ranked by their distance from `near`, so for the business profile that is the station.
    stationDistanceM: input.near ? row.distanceFromOriginM : undefined,
  };
  const result = scoreHotel(inputs, input.profile);
  const simulated = result.simulated || works.some((w) => w.work.simulated);
  const { noise, roadworks, airQuality, realNights, nightlife } = result.breakdown;
  const part = ({ value, weight, points }: typeof noise) => ({ value, weight, points });
  return {
    hotelId: row._id,
    name: row.name ?? "Unnamed hotel",
    location: { lat: row.location.coordinates[1], lon: row.location.coordinates[0] },
    score: Math.round(result.score),
    breakdown: {
      noise: part(noise),
      roadworks: part(roadworks),
      airQuality: part(airQuality),
      realNights: part(realNights),
      nightlife: part(nightlife),
    },
    sources: {
      sensors: row.sensors.map((s) => ({ id: s._id, distanceM: s.distanceM })),
      permits: works.map((w) => ({
        ref: w.work.permitReferenceNumber,
        distanceM: w.distanceM,
        overlapsStay: true,
        nightWork: w.nightWork,
      })),
      // Simulated cohort nights count too, and say so: never presented as real people's nights.
      realNights: {
        count: row.nights.length,
        simulated: row.nights.some((night) => night.simulated === true),
      },
    },
    estimate: true as const,
    bookingUrl: row.bookingLink.url,
    simulated,
  };
}

/** The query plan for the ranking pipeline, and whether `$geoNear` used the 2dsphere index. */
export async function explainRank(input: RankInput, repo: RankRepo = createRankRepo()) {
  const plan = await repo.explain(buildRankPipeline({ near: input.near }));
  return { usesGeoIndex: usesGeoIndex(plan), plan };
}

/** `stays.rank`: hotels best first for the profile and stay dates. An indicative estimate. */
export async function rank(
  input: RankInput,
  repo: RankRepo = createRankRepo(),
): Promise<RankResult> {
  const rows = await repo.aggregate(buildRankPipeline({ near: input.near }));
  const stayDates = stayNights(input.checkIn, input.checkOut);
  const airSensorIds = [
    ...new Set(rows.flatMap((row) => (row.airSensors ?? []).map((s) => s._id))),
  ];
  const air = new Map((await repo.nightAir(airSensorIds)).map((r) => [r.sensorId, r]));
  const hotels = rows
    .map((row) => rowToScore(row, input, stayDates, air))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { profile: input.profile, checkIn: input.checkIn, checkOut: input.checkOut, hotels };
}
