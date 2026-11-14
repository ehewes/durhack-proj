export const NOISE_LABELS = [
  "construction",
  "traffic",
  "siren",
  "snoring",
  "other",
  "uncertain",
  /** The phone itself (sleeve, pillow, bedsheets): never linked to wake-ups or briefed */
  "handling",
] as const;

export type NoiseLabel = (typeof NOISE_LABELS)[number];
