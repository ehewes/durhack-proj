import { z } from "zod";

export const anchorInput = z.object({ nightId: z.uuid() });
export const verifyInput = z.object({ nightId: z.uuid() });

const hex = z.string().regex(/^[0-9a-f]{64}$/);

export const EVIDENCE_NOTE = "Proves when the log existed, not that the noise happened.";

export const anchorOutput = z.object({
  nightId: z.uuid(),
  hash: hex,
  signature: z.string(),
  explorerUrl: z.string(),
  /** True when this log was already anchored and nothing new was written. */
  alreadyAnchored: z.boolean(),
});

/**
 * `not-anchored`: no memo yet. `match`: the log hashes to what the memo holds.
 * `mismatch`: the log was changed after it was anchored (or the memo is not for this night).
 */
export const verifyOutput = z.object({
  nightId: z.uuid(),
  status: z.enum(["not-anchored", "match", "mismatch"]),
  /** SHA-256 of the log as it is now */
  currentHash: hex,
  /** Hash read back from the on-chain memo */
  anchoredHash: hex.nullable(),
  signature: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  /** What a match does and does not show. */
  note: z.string(),
});

export const reportInput = z.object({ nightId: z.uuid() });

/** One construction event outside the council's recommended hours. */
export const reportEvent = z.object({
  id: z.string(),
  /** ISO time of the spike */
  at: z.iso.datetime({ offset: true }),
  /** The time as a resident reads it, Europe/London, e.g. "Mon 16 Nov, 06:41" */
  localTime: z.string(),
  label: z.literal("construction"),
  /** Relative dB, never a calibrated level */
  relativeDb: z.number(),
});

export const reportOutput = z.object({
  nightId: z.uuid(),
  night: z.iso.date(),
  events: z.array(reportEvent),
  /** The Solana memo that timestamps the log; null until anchored or after the log changed */
  memo: z
    .object({
      signature: z.string(),
      explorerUrl: z.string(),
      hash: hex,
    })
    .nullable(),
  /** Complaint text ready to send; null when there are no events to report */
  draft: z.string().nullable(),
  /** `gemini` when Gemini wrote it, `template` when Kip's own wording stepped in */
  draftSource: z.enum(["gemini", "template"]).nullable(),
  /** What the memo does and does not show. */
  note: z.string(),
});

export type ReportEvent = z.infer<typeof reportEvent>;
export type ReportOutput = z.infer<typeof reportOutput>;
export type AnchorOutput = z.infer<typeof anchorOutput>;
export type VerifyOutput = z.infer<typeof verifyOutput>;
