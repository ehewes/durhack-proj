import { z } from "zod";
import { NOISE_LABELS } from "../domain";

/** One live reading: epoch seconds and relative dB (uncalibrated phone microphone, ~1 Hz) */
export const liveSample = z.object({
  t: z.number(),
  db: z.number(),
});
export type LiveSample = z.infer<typeof liveSample>;

/** A level above the rolling-median baseline by the spike threshold (docs/DOMAIN.md) */
export const liveSpike = z.object({
  t: z.number(),
  peakDb: z.number(),
  baselineDb: z.number(),
});
export type LiveSpike = z.infer<typeof liveSpike>;

/** A labelled spike, pushed to the web viewer; the briefing audio arrives once it is made */
export const liveEvent = z.object({
  spike: liveSpike,
  label: z.enum(NOISE_LABELS),
  /** Only meaningful for `construction`; "outside the council's recommended hours" in copy */
  outsideRecommendedHours: z.boolean(),
  briefingAudioUrl: z.url().nullable(),
});
export type LiveEvent = z.infer<typeof liveEvent>;

/** `live.push` input: a batch of samples from the iOS sender */
export const livePushInput = z.object({
  samples: z.array(liveSample).min(1),
});
export type LivePushInput = z.infer<typeof livePushInput>;

/** One item on the `live.stream` subscription */
export const liveStreamItem = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sample"), sample: liveSample }),
  z.object({ type: z.literal("event"), event: liveEvent }),
]);
export type LiveStreamItem = z.infer<typeof liveStreamItem>;
