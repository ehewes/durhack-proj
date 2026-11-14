import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { RANDOM_WINDOW_COUNT, SAY_SIMULATED } from "@kip/shared/domain";

export const TITLE = "Wake-ups";
export const METHOD =
  "Wake-ups linked to noise spikes, counted against random moments from the same night.";
export const TRACK_CAPTION = "Wake-ups. A filled mark followed a spike.";
export const NO_WAKE_UPS = "No wake-ups recorded for this night.";
export const LOADING = "Loading wake-ups.";
export const LOAD_ERROR = "We could not load wake-ups for this night.";
export const TRY_AGAIN = "Try again";

function capitalise(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export const SIMULATED_NIGHT = `${capitalise(SAY_SIMULATED)} night.`;

/** 24-hour Europe/London time, matching the night timeline. */
export function clock(epochSeconds: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochSeconds * 1000));
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

/**
 * The random-window rate as a reduced count of the windows `forNight` draws
 * (`RANDOM_WINDOW_COUNT`). 0.1 is 100 of 1000, shown as 1 of 10.
 * A rate of 0 stays 0 of 1000, the number of draws.
 */
export function randomMomentCounts(rate: number): { hits: number; moments: number } {
  if (!Number.isFinite(rate) || rate <= 0) return { hits: 0, moments: RANDOM_WINDOW_COUNT };
  const hits = Math.round(Math.min(1, rate) * RANDOM_WINDOW_COUNT);
  if (hits <= 0) return { hits: 0, moments: RANDOM_WINDOW_COUNT };
  const divisor = gcd(hits, RANDOM_WINDOW_COUNT);
  return { hits: hits / divisor, moments: RANDOM_WINDOW_COUNT / divisor };
}

/**
 * Counts for this night, then the random-moment comparison.
 * Wording comes from `night.text` ("followed", never "caused by").
 */
export function attributionSummaryText(
  result: Pick<AttributionForNightOutput, "night" | "randomWindowRate">,
): string {
  const random = randomMomentCounts(result.randomWindowRate);
  return `${result.night.text}; random moments: ${random.hits} of ${random.moments}`;
}

export function wakeLine(wake: { t: number; linkedEventId: string | null }): string {
  const when = clock(wake.t);
  if (wake.linkedEventId) return `${when} Wake-up, followed a spike`;
  return `${when} Wake-up`;
}

export function spikeLine(epochSeconds: number): string {
  return `Spike at ${clock(epochSeconds)}`;
}
