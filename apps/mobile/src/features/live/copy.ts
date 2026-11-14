import {
  type NoiseLabel,
  OUTSIDE_HOURS_WORDING,
  SAY_RELATIVE_DB,
  SAY_SIMULATED,
} from "@kip/shared/domain";
import type { LiveEvent } from "@kip/shared/live";
import type { DashboardState } from "./dashboard";

const sentenceCase = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);

/** Visual window for the meter. Relative levels are not a calibrated scale. */
export const METER_MIN_DB = 20;
export const METER_MAX_DB = 80;

export const LIVE_TITLE = "Live noise";
export const METER_CAPTION = `Phone microphone, ${SAY_RELATIVE_DB}, not calibrated.`;
export const SIMULATED_BANNER = `${sentenceCase(SAY_SIMULATED)} stream. Development demo, not a live microphone.`;
export const WAITING_LEVEL = `Waiting for the first ${SAY_RELATIVE_DB}.`;
export const WAITING_EVENT = "Waiting for a labelled spike.";
export const CONNECTING = "Connecting to the live stream.";
export const STREAM_ERROR = "The live stream stopped. Try again.";
export const TRY_AGAIN = "Try again";
export const BRIEFING_TITLE = "Briefing";
export const BRIEFING_WAITING = "The briefing plays here once it is ready.";
export const BRIEFING_UNAVAILABLE = "Briefing audio did not start. Tap play briefing to try again.";
export const BRIEFING_WEB_ONLY = "Open this dashboard on the web to play the briefing.";
export const PLAY_BRIEFING = "Play briefing";
export const PLAY_BRIEFING_AGAIN = "Play briefing again";
export const WITHIN_HOURS = "Within the council's recommended hours";

export function formatLevel(db: number): string {
  return db.toFixed(1);
}

export function levelLine(db: number): string {
  return `${formatLevel(db)} ${SAY_RELATIVE_DB}`;
}

export function peakLine(db: number): string {
  return `Peak ${formatLevel(db)} ${SAY_RELATIVE_DB}`;
}

export function baselineLine(db: number): string {
  return `Baseline ${formatLevel(db)} ${SAY_RELATIVE_DB}`;
}

/** 24-hour Europe/London time, matching the construction-hours check. */
export function formatSpikeTime(epochSec: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochSec * 1000));
}

export function spikeTimeLine(epochSec: number): string {
  return `Spike at ${formatSpikeTime(epochSec)}`;
}

export function labelTitle(label: NoiseLabel): string {
  return sentenceCase(label);
}

/** Hours check for a construction spike. Other labels have no hours flag. */
export function hoursLine(event: LiveEvent): string | null {
  if (event.label !== "construction") return null;
  return event.outsideRecommendedHours ? OUTSIDE_HOURS_WORDING : WITHIN_HOURS;
}

/** 0 to 1 across the meter's display window. Clamped. */
export function meterFraction(db: number): number {
  const span = METER_MAX_DB - METER_MIN_DB;
  return Math.min(1, Math.max(0, (db - METER_MIN_DB) / span));
}

/** Every sentence the dashboard can show for this state. Components use the same helpers. */
export function screenLines(state: DashboardState): string[] {
  const lines = [LIVE_TITLE, METER_CAPTION];
  if (state.source === "simulated") lines.push(SIMULATED_BANNER);
  lines.push(state.db === null ? WAITING_LEVEL : levelLine(state.db));
  if (state.status === "connecting") lines.push(CONNECTING);
  if (state.status === "error") lines.push(STREAM_ERROR, TRY_AGAIN);
  if (!state.event) {
    lines.push(WAITING_EVENT, BRIEFING_WAITING);
    return lines;
  }
  lines.push(labelTitle(state.event.label));
  const hours = hoursLine(state.event);
  if (hours) lines.push(hours);
  lines.push(
    peakLine(state.event.spike.peakDb),
    baselineLine(state.event.spike.baselineDb),
    spikeTimeLine(state.event.spike.t),
  );
  if (state.event.briefingAudioUrl) lines.push(BRIEFING_TITLE, PLAY_BRIEFING);
  else lines.push(BRIEFING_WAITING);
  return lines;
}
