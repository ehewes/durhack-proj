import { toLocalTime } from "./time";

/**
 * Newcastle City Council's recommended hours for noisy construction work, local time.
 * Weekday index: 0 = Sunday ... 6 = Saturday. Sundays and bank holidays allow none.
 */
export const CONSTRUCTION_HOURS: Readonly<Record<number, { start: number; end: number } | null>> = {
  0: null,
  1: { start: 8 * 60, end: 18 * 60 },
  2: { start: 8 * 60, end: 18 * 60 },
  3: { start: 8 * 60, end: 18 * 60 },
  4: { start: 8 * 60, end: 18 * 60 },
  5: { start: 8 * 60, end: 18 * 60 },
  6: { start: 8 * 60, end: 13 * 60 },
};

/** England and Wales bank holidays come from https://www.gov.uk/bank-holidays.json */
export const BANK_HOLIDAYS_URL = "https://www.gov.uk/bank-holidays.json";

/**
 * True when `at` falls outside the council's *recommended* hours.
 * `bankHolidays` holds ISO dates ("2026-12-25") for England and Wales.
 */
export function isOutsideConstructionHours(at: Date, bankHolidays: ReadonlySet<string>): boolean {
  const local = toLocalTime(at);
  if (bankHolidays.has(local.date)) return true;
  const hours = CONSTRUCTION_HOURS[local.weekday];
  if (!hours) return true;
  return local.minutes < hours.start || local.minutes >= hours.end;
}
