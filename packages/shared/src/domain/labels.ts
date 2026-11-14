export const NOISE_LABELS = [
  "construction",
  "traffic",
  "siren",
  "snoring",
  "other",
  "uncertain",
] as const;

export type NoiseLabel = (typeof NOISE_LABELS)[number];
