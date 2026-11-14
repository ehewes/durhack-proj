export const TIME_ZONE = "Europe/London";

export interface LocalTime {
  /** ISO date in Europe/London, e.g. "2026-11-14" */
  date: string;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** Minutes since local midnight */
  minutes: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock date, weekday and time in Europe/London (handles BST). */
export function toLocalTime(at: Date): LocalTime {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
