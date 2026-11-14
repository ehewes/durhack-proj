import { toLocalTime } from "./time";

/** Night window for Lnight, Europe/London local time: 23:00 to 07:00 (docs/DOMAIN.md). */
export const NIGHT_START_MINUTES = 23 * 60;
export const NIGHT_END_MINUTES = 7 * 60;

/** True between 23:00 and 07:00 London time, whatever the UTC offset that night. */
export function isInNightWindow(at: Date): boolean {
  const { minutes } = toLocalTime(at);
  return minutes >= NIGHT_START_MINUTES || minutes < NIGHT_END_MINUTES;
}

/**
 * The night a moment belongs to, named by the evening's London date ("2026-11-14" for
 * 02:00 on the 15th). Splits at local noon, so it is defined for any time of day.
 */
export function nightOf(at: Date): string {
  const local = toLocalTime(at);
  if (local.minutes >= 12 * 60) return local.date;
  const [y, m, d] = local.date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
