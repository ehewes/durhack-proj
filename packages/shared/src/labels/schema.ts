import { z } from "zod";
import { NOISE_LABELS } from "../domain/labels";

const noiseLabel = z.enum(NOISE_LABELS);

/** 16 kHz mono 16-bit WAV: the only clip format (docs/DOMAIN.md, Noise classification). */
export const CLIP_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
] as const;

/** A 10 s clip at 16 kHz mono 16-bit is about 320 kB. Anything over 1 MiB is not one of ours. */
export const MAX_CLIP_BYTES = 1_048_576;

/** Seconds a spike time may differ from the stored event time and still be that event. */
export const SPIKE_MATCH_SECONDS = 2;

/** Query string of `POST /upload/clip`. The body is the WAV bytes; the mime is its Content-Type. */
export const clipUploadQuery = z.object({
  nightId: z.uuid(),
  /** Spike time, epoch seconds, as in the night upload's `spikes[].t` */
  t: z.coerce.number().finite(),
});

export const clipUploadResult = z.object({
  eventId: z.string(),
  label: noiseLabel,
});

export const labelsForNightInput = z.object({ nightId: z.uuid() });

export const labelsForNightOutput = z.object({
  nightId: z.uuid(),
  events: z.array(
    z.object({
      id: z.string(),
      t: z.number(),
      /** Final label; null until the clip is labelled. `uncertain` when classifiers disagree */
      label: noiseLabel.nullable(),
      outsideRecommendedHours: z.boolean().nullable(),
    }),
  ),
});

export type ClipUploadQuery = z.infer<typeof clipUploadQuery>;
export type ClipUploadResult = z.infer<typeof clipUploadResult>;
export type LabelsForNightInput = z.infer<typeof labelsForNightInput>;
export type LabelsForNightOutput = z.infer<typeof labelsForNightOutput>;
