import bankHolidays from "./bank-holidays.json";
import { toLocalTime } from "./time";

/** England and Wales bank holidays. Snapshot in bank-holidays.json; refresh with the script. */
export const BANK_HOLIDAYS_URL = "https://www.gov.uk/bank-holidays.json";

/** What the UI says. These are recommended hours, so never "illegal" or "breach". */
export const OUTSIDE_HOURS_WORDING = "outside the council's recommended hours";

/**
 * Newcastle City Council's recommended hours for noisy construction work, local minutes.
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

const BANK_HOLIDAYS: ReadonlySet<string> = new Set(bankHolidays.englandAndWales);

/** True when `at` falls outside the council's recommended hours, in Europe/London time. */
export function isOutsideRecommendedHours(
  at: Date,
  holidays: ReadonlySet<string> = BANK_HOLIDAYS,
): boolean {
  const local = toLocalTime(at);
  if (holidays.has(local.date)) return true;
  const hours = CONSTRUCTION_HOURS[local.weekday];
  if (!hours) return true;
  return local.minutes < hours.start || local.minutes >= hours.end;
}
