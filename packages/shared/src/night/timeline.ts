import { z } from "zod";
import { NOISE_LABELS } from "../domain/labels";
import { sleepStage } from "./upload";

const isoDateTime = z.iso.datetime({ offset: true });
const noiseLabel = z.enum(NOISE_LABELS);

/** A spike, with what the `labels`, `attribution` and hours checks have added so far. */
export const nightEvent = z.object({
  id: z.string(),
  /** Epoch seconds */
  t: z.number(),
  /** Relative dB */
  peakDb: z.number(),
  /** Final label; null until labelled. `uncertain` when the two classifiers disagree */
  label: noiseLabel.nullable(),
  labelSources: z.object({
    gemini: noiseLabel.nullable(),
    scribe: noiseLabel.nullable(),
  }),
  /** Null until checked; true for construction outside the council's recommended hours */
  outsideRecommendedHours: z.boolean().nullable(),
});

export const wakeUp = z.object({
  t: z.number(),
  /** A Watch "awake" stage, or a sudden heart-rate jump during sleep */
  source: z.enum(["stage", "heartRate"]),
  /** The spike in the look-back window before it, if any */
  linkedEventId: z.string().nullable(),
});

/** Counts against random windows; percentages only once several nights are pooled. */
export const attributionResult = z.object({
  wakeUps: z.number().int(),
  followedSpike: z.number().int(),
  /** Share of random windows from the same night that contained a spike */
  randomWindowRate: z.number().min(0).max(1),
  nightsPooled: z.number().int(),
});

export const evidenceRecord = z.object({
  /** SHA-256 of the canonical night log, hex */
  hash: z.string().nullable(),
  /** Solana Memo transaction signature */
  memoSignature: z.string().nullable(),
});

/** Everything the night screen draws. */
export const nightTimeline = z.object({
  nightId: z.uuid(),
  /** The evening's London date, from `nightOf` */
  night: z.iso.date(),
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  baselineDb: z.number(),
  /** Downsampled relative dB for drawing: [epoch seconds, dB] */
  noise: z.array(z.tuple([z.number(), z.number()])),
  stages: z.array(z.object({ start: isoDateTime, end: isoDateTime, stage: sleepStage })),
  events: z.array(nightEvent),
  wakeUps: z.array(wakeUp),
  attribution: attributionResult.nullable(),
  evidence: evidenceRecord,
});

/** One per night in MongoDB `nights` and in night lists. */
export const nightSummary = z.object({
  nightId: z.uuid(),
  userId: z.uuid(),
  night: z.iso.date(),
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  eventCount: z.number().int(),
  labelCounts: z.partialRecord(noiseLabel, z.number().int()),
  outsideRecommendedHoursCount: z.number().int(),
  wakeUpCount: z.number().int(),
  attribution: attributionResult.nullable(),
  evidence: evidenceRecord,
});

export type NightEvent = z.infer<typeof nightEvent>;
export type WakeUp = z.infer<typeof wakeUp>;
export type AttributionResult = z.infer<typeof attributionResult>;
export type NightTimeline = z.infer<typeof nightTimeline>;
export type NightSummary = z.infer<typeof nightSummary>;
