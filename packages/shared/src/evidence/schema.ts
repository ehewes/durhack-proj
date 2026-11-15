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

export type AnchorOutput = z.infer<typeof anchorOutput>;
export type VerifyOutput = z.infer<typeof verifyOutput>;
