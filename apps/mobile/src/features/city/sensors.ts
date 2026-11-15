import type { SensorLevel } from "@kip/shared/city";
import type { MapFeature, MapFeatureCollection } from "@/lib/map";
import { SOURCE } from "./copy";

/** A sensor with fewer nights than this is shown but not shaded. */
export const MIN_NIGHTS = 30;
export const STALE_AFTER_MS = 3 * 24 * 3600 * 1000;

export type SensorState = "shaded" | "outOfRange" | "fewNights" | "missing" | "stale";

/** Lower bounds in % highly sleep disturbed: one blue ramp from light to dark. */
export const SHADE_BANDS = [
  { min: 0, color: "#dfe6f7", label: "Under 4%" },
  { min: 4, color: "#b3c3ec", label: "4 to 6%" },
  { min: 6, color: "#7f9be0", label: "6 to 8%" },
  { min: 8, color: "#4a6fd0", label: "8 to 10%" },
  { min: 10, color: "#1f3a8a", label: "10% or more" },
] as const;

/** Unshaded sensors are a neutral grey. */
export const UNSHADED_COLOR = "#9a9a94";

export function bandOf(pct: number): (typeof SHADE_BANDS)[number] {
  let found: (typeof SHADE_BANDS)[number] = SHADE_BANDS[0];
  for (const band of SHADE_BANDS) if (pct >= band.min) found = band;
  return found;
}

/** Why a sensor is or is not shaded. Each unshaded reason is its own state. */
export function sensorState(sensor: SensorLevel, now: number): SensorState {
  if (sensor.nights <= 0) return "missing";
  if (
    sensor.notEnoughData ||
    sensor.nights < MIN_NIGHTS ||
    sensor.pctHighlySleepDisturbed === null
  ) {
    return "fewNights";
  }
  const updated = Date.parse(sensor.updatedAt);
  if (Number.isNaN(updated) || now - updated > STALE_AFTER_MS) return "stale";
  return sensor.outOfRange ? "outOfRange" : "shaded";
}

export function isShaded(state: SensorState): boolean {
  return state === "shaded" || state === "outOfRange";
}

export function sensorColor(sensor: SensorLevel, now: number): string {
  return isShaded(sensorState(sensor, now)) && sensor.pctHighlySleepDisturbed !== null
    ? bandOf(sensor.pctHighlySleepDisturbed).color
    : UNSHADED_COLOR;
}

/** Most disturbed first, then unshaded sensors by name. */
export function sortSensors(sensors: SensorLevel[], now: number): SensorLevel[] {
  return sensors.slice().sort((a, b) => {
    const sa = isShaded(sensorState(a, now));
    const sb = isShaded(sensorState(b, now));
    if (sa !== sb) return sa ? -1 : 1;
    const diff = (b.pctHighlySleepDisturbed ?? 0) - (a.pctHighlySleepDisturbed ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

/**
 * One point per sensor for `lib/map`. `color` and `state` ride along as properties so the map
 * can shade by them. Positions are [longitude, latitude].
 */
export function sensorFeatures(sensors: SensorLevel[], now: number): MapFeatureCollection {
  const features: MapFeature[] = sensors.map((sensor) => ({
    type: "Feature",
    id: sensor.id,
    geometry: { type: "Point", coordinates: [sensor.lon, sensor.lat] },
    properties: {
      name: sensor.name,
      state: sensorState(sensor, now),
      color: sensorColor(sensor, now),
      pct: sensor.pctHighlySleepDisturbed,
    },
  }));
  return { type: "FeatureCollection", features };
}

const London = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function updatedText(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "unknown" : London.format(new Date(t));
}

/** "7.8%", one decimal at most. */
export function pctText(pct: number | null): string {
  return pct === null ? "No estimate" : `${Math.round(pct * 10) / 10}%`;
}

/** Detail lines for a selected sensor, in display order. */
export function sensorDetails(sensor: SensorLevel): { label: string; value: string }[] {
  return [
    { label: "Source", value: SOURCE },
    {
      label: "30-night Lnight",
      value: sensor.lnight30 === null ? "Not enough data" : `${sensor.lnight30} dB`,
    },
    { label: "Nights", value: String(sensor.nights) },
    { label: "Last update", value: updatedText(sensor.updatedAt) },
  ];
}
