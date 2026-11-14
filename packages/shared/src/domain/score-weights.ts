// Quiet Stay Score (docs/BUSINESS.md). Pure: no IO. The result is an indicative estimate.
import { roadTrafficDisturbance } from "./who-curve";
import { SAY_INDICATIVE_ESTIMATE, SAY_SIMULATED } from "./wording";

export const TRAVELLER_PROFILES = ["lightSleeper", "nightOut", "bestValue", "business"] as const;

export type TravellerProfile = (typeof TRAVELLER_PROFILES)[number];

/**
 * Breakdown lines, in order. Nightlife includes sights (one preference in docs/BUSINESS.md).
 * Station is the business profile's extra line.
 */
export const SCORE_INPUTS = [
  "noise",
  "roadworks",
  "airQuality",
  "realNights",
  "nightlife",
  "station",
] as const;

export type ScoreInput = (typeof SCORE_INPUTS)[number];

/**
 * Points a noise value loses per percentage point of highly sleep disturbed.
 * 0% would score 100. The WHO range (about 3% to 12%) stays the wide term.
 */
export const NOISE_VALUE_PER_PERCENT = 8;

/** Active roadworks beyond this distance do not count. */
export const WORKS_RADIUS_M = 200;

/** How far a daytime permit that covers the whole stay pulls the roadworks value down, before the cap. */
export const WORKS_BASE_PENALTY = 8;

/** A full night permit on every stay date brings the roadworks value to 0. */
export const WORKS_PENALTY_CAP = 16;

/** Night work counts this many times daytime work. */
export const NIGHT_WORK_MULTIPLIER = 2;

/** Opted-in nights beyond this distance do not correct the estimate. */
export const REAL_NIGHTS_RADIUS_M = 300;

/**
 * Nights within REAL_NIGHTS_RADIUS_M required before they correct the estimate.
 * Same bar as the city map: fewer than this is not enough data.
 */
export const MIN_REAL_NIGHTS = 30;

/** WHO 2021 24-hour PM2.5 guideline, µg/m³. At this level the air-quality value is 0. */
export const AIR_PM25_GUIDELINE_UG = 15;

/** WHO 2021 24-hour NO2 guideline, µg/m³. At this level the air-quality value is 0. */
export const AIR_NO2_GUIDELINE_UG = 25;

/** Closeness fades to zero at this distance. Inside it, a place is within walking distance. */
export const WALKING_DISTANCE_M = 800;

/** Price the best-value profile measures quiet points against, in GBP per night. */
export const VALUE_REFERENCE_PRICE_GBP = 100;

export type ProfileWeights = {
  /** Share of the score taken by night-noise disturbance. The main factor for a light sleeper. */
  noise: number;
  roadworks: number;
  /** Small. See the profile table: never the largest share. */
  airQuality: number;
  /**
   * Share moved onto noise until MIN_REAL_NIGHTS nights within REAL_NIGHTS_RADIUS_M exist,
   * then applied to those nights so they correct the estimate.
   */
  realNights: number;
  /** Non-negative. Closer nightlife raises this preference. Never a penalty. */
  nightlife: number;
  /** Non-negative. Folded into the nightlife line with `nightlife`. */
  sights: number;
  /** Non-negative. Closer to the station raises the score. */
  station: number;
  /** Moved from station onto noise for the fraction of the stay that is Sun to Thu. */
  weeknightNoise: number;
  /** When true, points are quiet points times VALUE_REFERENCE_PRICE_GBP / price. */
  perPound: boolean;
};

export const SCORE_WEIGHTS = {
  /** Lowest predicted disturbance. */
  lightSleeper: {
    noise: 0.55,
    roadworks: 0.2,
    airQuality: 0.1,
    realNights: 0.15,
    nightlife: 0,
    sights: 0,
    station: 0,
    weeknightNoise: 0,
    perPound: false,
  },
  /** Within walking distance of nightlife, then quietest. */
  nightOut: {
    noise: 0.3,
    roadworks: 0.1,
    airQuality: 0.05,
    realNights: 0.1,
    nightlife: 0.35,
    sights: 0.1,
    station: 0,
    weeknightNoise: 0,
    perPound: false,
  },
  /** Most quiet points per pound per night. Same quiet weights as a light sleeper, then the price. */
  bestValue: {
    noise: 0.55,
    roadworks: 0.2,
    airQuality: 0.1,
    realNights: 0.15,
    nightlife: 0,
    sights: 0,
    station: 0,
    weeknightNoise: 0,
    perPound: true,
  },
  /** Quiet on weeknights, close to the station. */
  business: {
    noise: 0.25,
    roadworks: 0.15,
    airQuality: 0.05,
    realNights: 0.1,
    nightlife: 0,
    sights: 0,
    station: 0.45,
    weeknightNoise: 0.2,
    perPound: false,
  },
} as const satisfies Record<TravellerProfile, ProfileWeights>;

/** A Street Manager permit already placed relative to the hotel. */
export type RoadworksInput = {
  distanceM: number;
  /** Calendar dates (YYYY-MM-DD) the permit is active. Dates outside the stay do not count. */
  activeDates: readonly string[];
  /**
   * True when the permit is night work, inferred by the caller from proposed times and
   * traffic management. Night work is weighted more.
   */
  nightWork: boolean;
};

/** One opted-in night already placed relative to the hotel. */
export type RealNightInput = {
  distanceM: number;
  /** Indicative % highly sleep disturbed on that night. */
  disturbancePercent: number;
  /** Cohort nights still count once there are enough of them, and must be labelled. */
  simulated?: boolean;
};

export type HotelScoreInputs = {
  /** Observatory Lnight in dB. Higher noise lowers the score. */
  lnightDb: number;
  works?: readonly RoadworksInput[];
  /** Nights of the stay, YYYY-MM-DD. Roadworks off these dates do not count. */
  stayDates: readonly string[];
  /** Night-time NO2 and PM2.5 in µg/m³. A missing reading does not penalise the hotel. */
  airQuality?: { no2?: number; pm25?: number };
  realNights?: readonly RealNightInput[];
  nightlifeDistanceM?: number;
  sightsDistanceM?: number;
  /** GBP per night. The best-value profile needs it. */
  pricePerNightGbp?: number;
  stationDistanceM?: number;
};

export type ScoreComponent = {
  input: ScoreInput;
  /** 0 to 100. Higher is better for the stay. */
  value: number;
  /** Share of the score after weeknight and real-night shifts. 0 to 1. */
  weight: number;
  /**
   * value * weight * priceFactor. For every profile except best value, priceFactor is 1
   * and the points sum to the score.
   */
  points: number;
  detail: string;
  /** Set when simulated cohort nights affected this line. */
  simulated?: boolean;
};

/**
 * Per-input breakdown. The five surroundings inputs use the Quiet Stays payload names.
 * `station` is the business profile's extra line; that payload does not have it yet.
 */
export type ScoreBreakdown = {
  noise: ScoreComponent;
  roadworks: ScoreComponent;
  airQuality: ScoreComponent;
  realNights: ScoreComponent;
  nightlife: ScoreComponent;
  station: ScoreComponent;
};

export type HotelScore = {
  /** 0 to 100. */
  score: number;
  profile: TravellerProfile;
  /** The score describes surroundings, not a measured room. */
  indicative: true;
  /** 1, except best value, where this is VALUE_REFERENCE_PRICE_GBP / price per night. */
  priceFactor: number;
  /** True when simulated cohort nights changed the score. */
  simulated: boolean;
  breakdown: ScoreBreakdown;
};

type EffectiveWeights = {
  noise: number;
  roadworks: number;
  airQuality: number;
  realNights: number;
  nightlife: number;
  station: number;
};

function canonicalStayDates(dates: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const date of dates) {
    if (seen.has(date)) continue;
    seen.add(date);
    unique.push(date);
  }
  return unique;
}

/** Sun to Thu: the traveller is at work the next day. Friday and Saturday nights are not. */
function isWeeknight(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return false;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 5 && weekday !== 6;
}

function weeknightShare(stayDates: readonly string[]): number {
  if (stayDates.length === 0) return 0;
  let weeknights = 0;
  for (const date of stayDates) {
    if (isWeeknight(date)) weeknights += 1;
  }
  return weeknights / stayDates.length;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampScore(value: number): number {
  return clamp(value, 0, 100);
}

function component(
  input: ScoreInput,
  value: number,
  weight: number,
  priceFactor: number,
  detail: string,
  simulated = false,
): ScoreComponent {
  const points = value * weight * priceFactor;
  return simulated
    ? { input, value, weight, points, detail, simulated: true }
    : { input, value, weight, points, detail };
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

function formatMetres(distanceM: number): string {
  return `${Math.round(distanceM)} m`;
}

function noiseValue(disturbancePercent: number): number {
  return clampScore(100 - Math.max(0, disturbancePercent) * NOISE_VALUE_PER_PERCENT);
}

function noiseDetail(percent: number, outOfRange: boolean, weeknightWeighted: boolean): string {
  const extras: string[] = [];
  if (outOfRange) extras.push("clamped to the valid range");
  if (weeknightWeighted) extras.push("weighted higher on weeknights");
  const extra = extras.length > 0 ? `, ${extras.join(", ")}` : "";
  return `${SAY_INDICATIVE_ESTIMATE} from night noise, ${formatPercent(percent)} highly sleep disturbed${extra}`;
}

function roadworksValue(
  works: readonly RoadworksInput[] | undefined,
  stayDates: readonly string[],
): { value: number; detail: string } {
  if (stayDates.length === 0) {
    return { value: 100, detail: "No stay dates, so roadworks are not counted" };
  }
  const stay = new Set(stayDates);
  let raw = 0;
  let nightPermits = 0;
  let dayPermits = 0;
  for (const work of works ?? []) {
    if (!Number.isFinite(work.distanceM) || work.distanceM < 0 || work.distanceM > WORKS_RADIUS_M) {
      continue;
    }
    const covered = new Set<string>();
    for (const date of work.activeDates) {
      if (stay.has(date)) covered.add(date);
    }
    if (covered.size === 0) continue;
    const share = covered.size / stayDates.length;
    const night = work.nightWork ? NIGHT_WORK_MULTIPLIER : 1;
    raw += WORKS_BASE_PENALTY * night * share;
    if (work.nightWork) nightPermits += 1;
    else dayPermits += 1;
  }
  const value = clampScore(100 * (1 - Math.min(raw, WORKS_PENALTY_CAP) / WORKS_PENALTY_CAP));
  return { value, detail: roadworksDetail(nightPermits, dayPermits) };
}

function roadworksDetail(nightPermits: number, dayPermits: number): string {
  if (nightPermits === 0 && dayPermits === 0) {
    return `No roadworks within ${WORKS_RADIUS_M} m on the stay dates`;
  }
  if (nightPermits > 0 && dayPermits > 0) {
    return "Night and daytime roadworks overlap the stay dates. Night work weighs more";
  }
  if (nightPermits > 0) {
    return "Night roadworks overlap the stay dates and weigh more than daytime work";
  }
  return "Daytime roadworks overlap the stay dates";
}

function airValue(air: HotelScoreInputs["airQuality"] | undefined): {
  value: number;
  detail: string;
} {
  const no2 = air?.no2;
  const pm25 = air?.pm25;
  const no2Known = no2 !== undefined && Number.isFinite(no2);
  const pmKnown = pm25 !== undefined && Number.isFinite(pm25);
  if (!no2Known && !pmKnown) {
    return { value: 100, detail: "No night air-quality reading" };
  }
  const no2Ratio = no2Known ? Math.max(0, no2) / AIR_NO2_GUIDELINE_UG : 0;
  const pmRatio = pmKnown ? Math.max(0, pm25) / AIR_PM25_GUIDELINE_UG : 0;
  const severity = Math.min(1, Math.max(no2Ratio, pmRatio));
  return {
    value: clampScore(100 * (1 - severity)),
    detail: `Night air quality is a small factor in the ${SAY_INDICATIVE_ESTIMATE}`,
  };
}

function nearbyNights(nights: readonly RealNightInput[] | undefined): RealNightInput[] {
  if (!nights) return [];
  const nearby: RealNightInput[] = [];
  for (const night of nights) {
    if (!Number.isFinite(night.distanceM) || night.distanceM < 0) continue;
    if (night.distanceM > REAL_NIGHTS_RADIUS_M) continue;
    if (!Number.isFinite(night.disturbancePercent)) continue;
    nearby.push(night);
  }
  return nearby;
}

function meanDisturbance(nights: readonly RealNightInput[]): number {
  let sum = 0;
  for (const night of nights) sum += Math.max(0, night.disturbancePercent);
  return sum / nights.length;
}

function realNightsDetail(count: number, simulated: boolean, correctedPercent: number): string {
  if (count < MIN_REAL_NIGHTS) {
    return `Not enough nights within ${REAL_NIGHTS_RADIUS_M} m to correct the ${SAY_INDICATIVE_ESTIMATE} (${count} of ${MIN_REAL_NIGHTS})`;
  }
  const nightsLabel = simulated ? `${SAY_SIMULATED} nights` : "Nights";
  return `${nightsLabel} within ${REAL_NIGHTS_RADIUS_M} m correct the ${SAY_INDICATIVE_ESTIMATE} to ${formatPercent(correctedPercent)} highly sleep disturbed`;
}

function closeness(distanceM: number | undefined): number {
  if (distanceM === undefined || !Number.isFinite(distanceM) || distanceM < 0) return 0;
  return Math.max(0, 1 - distanceM / WALKING_DISTANCE_M);
}

function nightlifeValue(
  nightlifeDistanceM: number | undefined,
  sightsDistanceM: number | undefined,
  nightlifeWeight: number,
  sightsWeight: number,
): number {
  const total = nightlifeWeight + sightsWeight;
  if (total <= 0) return 0;
  const nearNightlife = closeness(nightlifeDistanceM);
  const nearSights = closeness(sightsDistanceM);
  return (100 * (nightlifeWeight * nearNightlife + sightsWeight * nearSights)) / total;
}

function nightlifeDetail(
  weight: number,
  nightlifeDistanceM: number | undefined,
  sightsDistanceM: number | undefined,
): string {
  if (weight <= 0) return "Nightlife and sights are not part of this profile";
  const parts: string[] = [];
  if (
    nightlifeDistanceM !== undefined &&
    Number.isFinite(nightlifeDistanceM) &&
    nightlifeDistanceM >= 0
  ) {
    parts.push(`Nightlife is ${formatMetres(nightlifeDistanceM)} away`);
  }
  if (sightsDistanceM !== undefined && Number.isFinite(sightsDistanceM) && sightsDistanceM >= 0) {
    parts.push(`sights are ${formatMetres(sightsDistanceM)} away`);
  }
  if (parts.length === 0) return "No nightlife or sights distance";
  if (parts.length === 1) return parts[0] ?? "No nightlife or sights distance";
  return `${parts[0]}, and ${parts[1]}`;
}

function stationDetail(weight: number, distanceM: number | undefined): string {
  if (weight <= 0) return "The station is not part of this profile";
  if (distanceM === undefined || !Number.isFinite(distanceM) || distanceM < 0)
    return "No station distance";
  return `Station is ${formatMetres(distanceM)} away`;
}

function priceFactorFor(perPound: boolean, pricePerNightGbp: number | undefined): number {
  if (!perPound) return 1;
  if (
    pricePerNightGbp === undefined ||
    !Number.isFinite(pricePerNightGbp) ||
    pricePerNightGbp <= 0
  ) {
    return 1;
  }
  return VALUE_REFERENCE_PRICE_GBP / pricePerNightGbp;
}

function effectiveWeights(
  weights: ProfileWeights,
  weeknights: number,
  enoughNights: boolean,
): EffectiveWeights {
  const nightShift = weights.weeknightNoise * weeknights;
  const noise = weights.noise + nightShift + (enoughNights ? 0 : weights.realNights);
  const station = weights.station - nightShift;
  return {
    noise,
    roadworks: weights.roadworks,
    airQuality: weights.airQuality,
    realNights: enoughNights ? weights.realNights : 0,
    nightlife: weights.nightlife + weights.sights,
    station,
  };
}

/**
 * Quiet Stay Score for one hotel and one profile.
 * Each input is a 0 to 100 value (higher is better) times a profile weight.
 * Disturbance, from the WHO curve on Lnight, is the main weight for a light sleeper.
 * Roadworks count only inside WORKS_RADIUS_M and only on stay dates, with night work weighted more.
 * Air quality is a small weight. Real nights within REAL_NIGHTS_RADIUS_M correct the noise
 * estimate once MIN_REAL_NIGHTS is reached. Nightlife and sights are one preference: a weight
 * of 0 leaves them out. Best value scales the points by the reference price over the nightly price.
 * Business moves weight from the station onto noise on weeknights.
 * The returned score is the sum of the points, clamped to 0..100.
 */
export function scoreHotel(inputs: HotelScoreInputs, profile: TravellerProfile): HotelScore {
  if (!Number.isFinite(inputs.lnightDb)) {
    throw new Error("lnightDb must be a finite number");
  }
  const weights = SCORE_WEIGHTS[profile];
  const stayDates = canonicalStayDates(inputs.stayDates);
  const weeknights = weeknightShare(stayDates);
  const estimate = roadTrafficDisturbance(inputs.lnightDb);
  const nearby = nearbyNights(inputs.realNights);
  const enoughNights = nearby.length >= MIN_REAL_NIGHTS;
  const simulated = enoughNights && nearby.some((night) => night.simulated === true);
  const observedPercent = enoughNights ? meanDisturbance(nearby) : estimate.percentHighlyDisturbed;
  const shares = effectiveWeights(weights, weeknights, enoughNights);
  const factor = priceFactorFor(weights.perPound, inputs.pricePerNightGbp);

  const works = roadworksValue(inputs.works, stayDates);
  const air = airValue(inputs.airQuality);
  const preference = nightlifeValue(
    inputs.nightlifeDistanceM,
    inputs.sightsDistanceM,
    weights.nightlife,
    weights.sights,
  );

  const breakdown: ScoreBreakdown = {
    noise: component(
      "noise",
      noiseValue(estimate.percentHighlyDisturbed),
      shares.noise,
      factor,
      noiseDetail(
        estimate.percentHighlyDisturbed,
        estimate.outOfRange,
        weights.weeknightNoise > 0 && weeknights > 0,
      ),
    ),
    roadworks: component("roadworks", works.value, shares.roadworks, factor, works.detail),
    airQuality: component("airQuality", air.value, shares.airQuality, factor, air.detail),
    realNights: component(
      "realNights",
      noiseValue(observedPercent),
      shares.realNights,
      factor,
      realNightsDetail(nearby.length, simulated, observedPercent),
      simulated,
    ),
    nightlife: component(
      "nightlife",
      preference,
      shares.nightlife,
      factor,
      nightlifeDetail(shares.nightlife, inputs.nightlifeDistanceM, inputs.sightsDistanceM),
    ),
    station: component(
      "station",
      closeness(inputs.stationDistanceM) * 100,
      shares.station,
      factor,
      stationDetail(shares.station, inputs.stationDistanceM),
    ),
  };

  const raw =
    breakdown.noise.points +
    breakdown.roadworks.points +
    breakdown.airQuality.points +
    breakdown.realNights.points +
    breakdown.nightlife.points +
    breakdown.station.points;

  return {
    score: clampScore(raw),
    profile,
    indicative: true,
    priceFactor: factor,
    simulated,
    breakdown,
  };
}
