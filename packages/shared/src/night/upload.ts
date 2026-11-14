import { z } from "zod";

/** [epoch seconds, value] */
const sample = z.tuple([z.number(), z.number()]);

export const sleepStage = z.enum(["inBed", "awake", "core", "deep", "rem"]);

/** Draft contract: phone to API, one per night. Settle at M0 (docs/ARCHITECTURE.md). */
export const nightUpload = z.object({
  nightId: z.uuid(),
  userId: z.uuid(),
  /** ISO datetimes with Europe/London offsets */
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  /** Only with location consent */
  location: z.object({ lat: z.number(), lon: z.number() }).optional(),
  consent: z.object({ microphone: z.boolean(), health: z.boolean(), location: z.boolean() }),
  /** Relative dB from the uncalibrated phone microphone, sampled at 1 Hz */
  noise: z.object({ baselineDb: z.number(), samples: z.array(sample) }),
  spikes: z.array(z.object({ t: z.number(), peakDb: z.number(), clipId: z.string().optional() })),
  /** Absent in live demo mode */
  sleep: z
    .object({
      stages: z.array(
        z.object({
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
          stage: sleepStage,
        }),
      ),
      heartRate: z.array(sample),
      hrv: z.array(sample),
      respiratoryRate: z.array(sample),
    })
    .optional(),
});

export type NightUpload = z.infer<typeof nightUpload>;
