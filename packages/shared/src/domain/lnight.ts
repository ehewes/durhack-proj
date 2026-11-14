/** Nights of sensor data needed before the city map shades a sensor. */
export const MIN_NIGHTS_FOR_ESTIMATE = 30;

/**
 * Energy (logarithmic) average of dB levels: 10 * log10(mean(10^(L/10))).
 * Lnight is this average over the night window, never an arithmetic mean of dB.
 */
export function energyAverageDb(levels: readonly number[]): number {
  if (levels.length === 0) throw new Error("energyAverageDb needs at least one level");
  const meanEnergy = levels.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levels.length;
  return 10 * Math.log10(meanEnergy);
}
