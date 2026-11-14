import { z } from "zod";
import { isInNightWindow, toLocalTime } from "../domain";

/**
 * Newcastle upon Tyne. The same box the Street Manager sample is checked
 * against: a representative point inside it is kept, the rest of England is not.
 */
export const NEWCASTLE_AREA = {
  minLat: 54.95,
  maxLat: 55.05,
  minLon: -1.8,
  maxLon: -1.5,
} as const;

/** True when a WGS84 point sits in the Newcastle area, edges excluded. */
export function isInNewcastleArea(lat: number, lon: number): boolean {
  return (
    lat > NEWCASTLE_AREA.minLat &&
    lat < NEWCASTLE_AREA.maxLat &&
    lon > NEWCASTLE_AREA.minLon &&
    lon < NEWCASTLE_AREA.maxLon
  );
}

const position = z.tuple([z.number(), z.number()]);

/** GeoJSON geometry. Coordinates are `[longitude, latitude]`. */
export const workGeometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({
    type: z.literal("LineString"),
    coordinates: z.array(position).min(2),
  }),
]);

export type WorkGeometry = z.infer<typeof workGeometry>;

const clock = z.object({
  date: z.string().nullable(),
  time: z.string().nullable(),
});

/**
 * One Street Manager permit, as stored in MongoDB `works` and returned by `works.near`.
 * `simulated` is true only for labelled sample data, never for a live SNS permit.
 */
export const workRecord = z.object({
  permitReferenceNumber: z.string().min(1),
  workReferenceNumber: z.string().min(1),
  eventReference: z.number(),
  eventType: z.string().min(1),
  eventTime: z.string().min(1),
  objectReference: z.string().min(1),
  highwayAuthority: z.string().min(1),
  streetName: z.string().min(1),
  town: z.string().nullable(),
  areaName: z.string().nullable(),
  workCategory: z.string().min(1),
  trafficManagementType: z.string().min(1),
  currentTrafficManagementType: z.string().nullable(),
  workStatus: z.string().nullable(),
  proposedStart: clock,
  proposedEnd: clock,
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  /** Proposed clocks or the traffic management type say the work runs at night. */
  nightWork: z.boolean(),
  simulated: z.boolean(),
  geometry: workGeometry,
});

export type WorkRecord = z.infer<typeof workRecord>;

/** `works.near`: permits whose geometry is within `radiusM` and whose dates overlap. */
export const worksNearInput = z
  .object({
    lat: z.number().gte(-90).lte(90),
    lon: z.number().gte(-180).lte(180),
    /** Metres. 200 matches the Quiet Stay Score roadworks radius. */
    radiusM: z.number().positive().default(200),
    /** Inclusive Europe/London date, `YYYY-MM-DD`. */
    from: z.iso.date(),
    /** Inclusive Europe/London date, `YYYY-MM-DD`. */
    to: z.iso.date(),
  })
  .check((payload) => {
    if (payload.value.from > payload.value.to) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: "from is after to",
        path: ["from"],
      });
    }
  });

export type WorksNearInput = z.infer<typeof worksNearInput>;

export const worksNearResult = z.object({
  works: z.array(workRecord),
});

export type WorksNearResult = z.infer<typeof worksNearResult>;

export type WorkSchedule = {
  proposedStart: { date: string | null; time: string | null };
  proposedEnd: { date: string | null; time: string | null };
  actualStart: string | null;
  actualEnd: string | null;
  trafficManagementType: string;
  currentTrafficManagementType: string | null;
};

/** Daytime 07:00 to 23:00 is 16 hours. A longer proposed window must include the night. */
const DAYTIME_MS = 16 * 60 * 60 * 1000;

const NIGHT_WORD = /\bnight\b/i;

function parseInstant(value: string | null): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * True when `[start, end]` overlaps 23:00–07:00 Europe/London.
 * The endpoints are ordered first. A zero-length daytime instant does not count.
 */
export function intervalOverlapsNight(start: Date, end: Date): boolean {
  const earlier = start.getTime() <= end.getTime() ? start : end;
  const later = earlier === start ? end : start;
  if (isInNightWindow(earlier) || isInNightWindow(later)) return true;
  const duration = later.getTime() - earlier.getTime();
  if (duration >= DAYTIME_MS) return true;
  if (duration === 0) return false;
  return toLocalTime(later).minutes < toLocalTime(earlier).minutes;
}

/**
 * Night work comes from proposed clock times and the traffic management type
 * (`docs/DOMAIN.md`). A date with no clock is not midnight. Actual times are
 * stored on the permit and do not set this flag.
 */
export function isNightWork(schedule: WorkSchedule): boolean {
  if (
    NIGHT_WORD.test(schedule.trafficManagementType) ||
    NIGHT_WORD.test(schedule.currentTrafficManagementType ?? "")
  ) {
    return true;
  }
  const start = parseInstant(schedule.proposedStart.time);
  const end = parseInstant(schedule.proposedEnd.time);
  if (start && end) return intervalOverlapsNight(start, end);
  if (start) return isInNightWindow(start);
  if (end) return isInNightWindow(end);
  return false;
}

function londonDate(value: string | null): string | null {
  const instant = parseInstant(value);
  if (!instant) return null;
  return toLocalTime(instant).date;
}

function earliest(dates: readonly string[]): string | null {
  return dates.reduce<string | null>(
    (best, date) => (best === null || date < best ? date : best),
    null,
  );
}

function latest(dates: readonly string[]): string | null {
  return dates.reduce<string | null>(
    (best, date) => (best === null || date > best ? date : best),
    null,
  );
}

/**
 * Inclusive London dates the permit occupies. An actual end closes it.
 * Otherwise the proposed end is used. With no end, it stays open from the start.
 */
export function activeDates(schedule: WorkSchedule): { start: string; end: string | null } | null {
  const starts = [
    londonDate(schedule.actualStart),
    londonDate(schedule.proposedStart.time),
    londonDate(schedule.proposedStart.date),
  ].filter((date): date is string => date !== null);
  const proposedEnds = [
    londonDate(schedule.proposedEnd.time),
    londonDate(schedule.proposedEnd.date),
  ].filter((date): date is string => date !== null);
  const actualEnd = londonDate(schedule.actualEnd);
  const start = earliest([...starts, ...proposedEnds, ...(actualEnd ? [actualEnd] : [])]);
  if (!start) return null;
  const end = actualEnd ?? latest(proposedEnds);
  if (end !== null && end < start) return { start: end, end: start };
  return { start, end };
}

/** True when the permit's active dates overlap the inclusive `[from, to]` range. */
export function overlapsDates(schedule: WorkSchedule, from: string, to: string): boolean {
  const span = activeDates(schedule);
  if (!span) return false;
  if (span.start > to) return false;
  if (span.end !== null && span.end < from) return false;
  return true;
}
