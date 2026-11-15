import {
  SCORE_WEIGHTS,
  type TravellerProfile,
  VALUE_REFERENCE_PRICE_GBP,
} from "@kip/shared/domain";
import {
  type HotelScore,
  type RankInput,
  type RankResult,
  type ScoreBreakdown,
  toGeoJsonPosition,
} from "@kip/shared/stays";
import type { MapFeatureCollection, MapPosition } from "@/lib/map";
import { INPUT_LABEL } from "./copy";

export const DEFAULT_PROFILE: TravellerProfile = "lightSleeper";
/** The shared sample covers these dates, so the demo opens on them. */
export const DEFAULT_CHECK_IN = "2026-11-20";
export const DEFAULT_NIGHTS = 2;
export const MAX_NIGHTS = 14;

const DAY_MS = 86_400_000;

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "Fri 20 Nov", in UTC so the label matches the ISO date on every device. */
export function dateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function rankInputFor(
  profile: TravellerProfile,
  checkIn: string,
  nights: number,
): RankInput {
  const clamped = Math.min(Math.max(nights, 1), MAX_NIGHTS);
  return { profile, checkIn, checkOut: addDays(checkIn, clamped) };
}

/** The selection only counts while that hotel is in the current result. */
export function resolveSelection(hotels: readonly HotelScore[], id: string | null): string | null {
  return id !== null && hotels.some((hotel) => hotel.hotelId === id) ? id : null;
}

/** One neutral ink, lighter as the score drops. No second hue. */
export function markerColor(score: number): string {
  if (score >= 75) return "#1a1a18";
  if (score >= 60) return "#5f5f5a";
  return "#a3a39e";
}

export function hotelFeatures(hotels: readonly HotelScore[]): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotels.map((hotel) => ({
      type: "Feature",
      id: hotel.hotelId,
      geometry: { type: "Point", coordinates: toGeoJsonPosition(hotel.location) },
      properties: { name: hotel.name, score: hotel.score, color: markerColor(hotel.score) },
    })),
  };
}

export function hotelPosition(hotel: HotelScore): MapPosition {
  return toGeoJsonPosition(hotel.location);
}

export type BreakdownRow = {
  key: keyof ScoreBreakdown;
  label: string;
  value: number;
  weightPct: number;
  points: number;
};

/** Inputs this profile weighs. An input with no weight is left out of the breakdown. */
export function breakdownRows(hotel: HotelScore): BreakdownRow[] {
  return (Object.keys(INPUT_LABEL) as (keyof ScoreBreakdown)[])
    .map((key) => {
      const part = hotel.breakdown[key];
      return {
        key,
        label: INPUT_LABEL[key],
        value: Math.round(part.value),
        weightPct: Math.round(part.weight * 100),
        points: Math.round(part.points * 10) / 10,
      };
    })
    .filter((row) => row.weightPct > 0);
}

/**
 * Points the roadworks input lost. Only permits that overlap the stay dates cost anything, so a
 * hotel with none has no penalty to show.
 */
export function worksPenalty(hotel: HotelScore): { points: number; permits: number } | null {
  const permits = hotel.sources.permits.filter((permit) => permit.overlapsStay).length;
  if (permits === 0) return null;
  const { value, weight } = hotel.breakdown.roadworks;
  return { points: Math.round(weight * (100 - value) * 10) / 10, permits };
}

export type RankSamples = { lightSleeper: RankResult; nightOut: RankResult };

/**
 * Offline fallback built from the shared samples. Light sleeper and night out use their own
 * sample. Best value and business re-weight the light sleeper sample with the shared profile
 * weights. The sample has no station distance, so business drops that line and rescales.
 */
export function sampleRank(
  input: RankInput,
  samples: RankSamples,
): { result: RankResult; leavesOutStation: boolean } {
  const own = input.profile === "lightSleeper" || input.profile === "nightOut";
  const source = input.profile === "nightOut" ? samples.nightOut : samples.lightSleeper;
  const hotels = own ? source.hotels : source.hotels.map((hotel) => reweigh(hotel, input.profile));
  const sorted = [...hotels].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    result: {
      profile: input.profile,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      hotels: sorted,
    },
    leavesOutStation: input.profile === "business",
  };
}

function reweigh(hotel: HotelScore, profile: TravellerProfile): HotelScore {
  const w = SCORE_WEIGHTS[profile];
  const raw = {
    noise: w.noise,
    roadworks: w.roadworks,
    airQuality: w.airQuality,
    realNights: w.realNights,
    nightlife: w.nightlife + w.sights,
  };
  const total = Object.values(raw).reduce((sum, v) => sum + v, 0);
  const factor =
    w.perPound && hotel.pricePerNightGbp ? VALUE_REFERENCE_PRICE_GBP / hotel.pricePerNightGbp : 1;
  const part = (key: keyof typeof raw) => {
    const weight = raw[key] / total;
    const value = hotel.breakdown[key].value;
    return { value, weight, points: value * weight * factor };
  };
  const breakdown = {
    noise: part("noise"),
    roadworks: part("roadworks"),
    airQuality: part("airQuality"),
    realNights: part("realNights"),
    nightlife: part("nightlife"),
  };
  const sum = Object.values(breakdown).reduce((s, p) => s + p.points, 0);
  return { ...hotel, breakdown, score: Math.round(Math.min(Math.max(sum, 0), 100)) };
}
