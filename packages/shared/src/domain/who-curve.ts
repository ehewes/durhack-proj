/** Range the WHO road-traffic curve is valid for, in dB Lnight. */
export const WHO_CURVE_MIN_DB = 40;
export const WHO_CURVE_MAX_DB = 65;

/** WHO 2018 night-time guideline values, dB Lnight. */
export const WHO_NIGHT_GUIDELINE_DB = { road: 45, rail: 44, aircraft: 40 } as const;

export type DisturbanceEstimate = {
  /** Indicative % of residents highly sleep disturbed */
  percentHighlyDisturbed: number;
  /** True when Lnight fell outside 40 to 65 dB and was clamped */
  outOfRange: boolean;
};

/**
 * Basner & McGuire 2018 road-traffic curve:
 * %HSD = 19.4312 - 0.9336 * L + 0.0126 * L^2.
 * Outside the valid range the input is clamped, never extrapolated. The result is indicative.
 */
export function roadTrafficDisturbance(lnightDb: number): DisturbanceEstimate {
  const clamped = Math.min(WHO_CURVE_MAX_DB, Math.max(WHO_CURVE_MIN_DB, lnightDb));
  return {
    percentHighlyDisturbed: 19.4312 - 0.9336 * clamped + 0.0126 * clamped ** 2,
    outOfRange: clamped !== lnightDb,
  };
}
