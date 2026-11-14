import { z } from "zod";
import { isOutsideRecommendedHours, NOISE_LABELS, type NoiseLabel } from "../domain";
import { attributionResult, evidenceRecord, type NightEvent, nightEvent, wakeUp } from "./timeline";

const noiseLabel = z.enum(NOISE_LABELS);

/** One classifier result. Omit a source to leave it unchanged; null clears it. */
export const eventLabelPatch = z.object({
  id: z.string().min(1),
  gemini: noiseLabel.nullable().optional(),
  scribe: noiseLabel.nullable().optional(),
});

export type EventLabelPatch = z.infer<typeof eventLabelPatch>;

/** What `attribution` writes onto a night. */
export const attributionWrite = z.object({
  wakeUps: z.array(wakeUp),
  attribution: attributionResult,
});

export type AttributionWrite = z.infer<typeof attributionWrite>;

/**
 * Mongo `nights` document. Dense samples stay in Tiger.
 * Location is null unless location consent was given. Events start unlabelled.
 */
export const nightDocument = z.object({
  nightId: z.uuid(),
  userId: z.uuid(),
  night: z.iso.date(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  baselineDb: z.number(),
  location: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  consent: z.object({ microphone: z.boolean(), health: z.boolean(), location: z.boolean() }),
  events: z.array(nightEvent),
  wakeUps: z.array(wakeUp),
  attribution: attributionResult.nullable(),
  evidence: evidenceRecord,
});

export type NightDocument = z.infer<typeof nightDocument>;

/**
 * One point per minute, the loudest second, aligned to `originSec` (the night's start).
 * Matches the timeline fixture so spikes stay visible.
 */
export function downsampleNoise(
  samples: readonly (readonly [number, number])[],
  originSec: number,
): [number, number][] {
  const buckets = new Map<number, number>();
  for (const [t, db] of samples) {
    const minute = Math.floor((t - originSec) / 60);
    const prev = buckets.get(minute);
    if (prev === undefined || db > prev) buckets.set(minute, db);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, db]) => [originSec + minute * 60, db]);
}

/** Spike list as timeline events. Unlabelled until `labels` calls `addEventLabels`. */
export function eventsFromSpikes(
  spikes: readonly { t: number; peakDb: number; clipId?: string }[],
): NightEvent[] {
  return spikes.map((spike, index) => ({
    id: spike.clipId ? spike.clipId : `spike-${index}`,
    t: spike.t,
    peakDb: spike.peakDb,
    label: null,
    labelSources: { gemini: null, scribe: null },
    outsideRecommendedHours: null,
  }));
}

/** Gemini and Scribe. They disagree as `uncertain`, so snoring is not blamed on a building site. */
export function resolveEventLabel(sources: {
  gemini: NoiseLabel | null;
  scribe: NoiseLabel | null;
}): NoiseLabel | null {
  const { gemini, scribe } = sources;
  if (gemini && scribe && gemini !== scribe) return "uncertain";
  return gemini ?? scribe;
}

/** Construction outside the council's recommended hours. Any other label is not an hours flag. */
export function hoursFlag(label: NoiseLabel | null, epochSec: number): boolean | null {
  if (label !== "construction") return null;
  return isOutsideRecommendedHours(new Date(epochSec * 1000));
}

export function applyEventLabel(event: NightEvent, patch: EventLabelPatch): NightEvent {
  const gemini = patch.gemini === undefined ? event.labelSources.gemini : patch.gemini;
  const scribe = patch.scribe === undefined ? event.labelSources.scribe : patch.scribe;
  const label = resolveEventLabel({ gemini, scribe });
  return {
    ...event,
    label,
    labelSources: { gemini, scribe },
    outsideRecommendedHours: hoursFlag(label, event.t),
  };
}
