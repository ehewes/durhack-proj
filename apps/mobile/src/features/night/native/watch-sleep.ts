import { nightOf, toLocalTime } from "@kip/shared/domain";
import type { NightUpload } from "@kip/shared/night";

// The Apple Watch as a sensor: what it tracked overnight, read from HealthKit once the night
// ends, with no Watch app (docs/DECISIONS.md, "Read Watch data through HealthKit"). Pure logic,
// no React Native: `healthkit.native.ts` feeds it HealthKit samples on iOS, and the web build
// has no HealthKit (`healthkit.web.ts`).

export type NightSleep = NonNullable<NightUpload["sleep"]>;
export type SleepStage = NightSleep["stages"][number]["stage"];
type Point = NightSleep["heartRate"][number];

/** A time range to read: a recording's start to stop, or a past night's `nightWindow`. */
export type SleepWindow = { start: Date; end: Date };

/** One HealthKit sample, reduced to what Kip uses. */
export type HealthSample = {
  start: Date;
  end: Date;
  /** A sleep-analysis value (`SLEEP_VALUE`), or the vital in its unit */
  value: number;
  /** Who wrote it: the HKSource bundle ID of the Watch, the iPhone or another app */
  sourceId: string;
  /** Written by an Apple Watch */
  fromWatch: boolean;
};

/** HealthKit samples for a window: heart rate and breathing in count/min, HRV (SDNN) in ms. */
export type RawHealth = {
  stages: readonly HealthSample[];
  heartRate: readonly HealthSample[];
  hrv: readonly HealthSample[];
  respiratoryRate: readonly HealthSample[];
};

/** Raw `HKCategoryValueSleepAnalysis` values. */
export const SLEEP_VALUE = {
  inBed: 0,
  asleepUnspecified: 1,
  awake: 2,
  asleepCore: 3,
  asleepDeep: 4,
  asleepREM: 5,
} as const;

const STAGE_BY_VALUE: Record<number, SleepStage> = {
  [SLEEP_VALUE.inBed]: "inBed",
  // Asleep with no stage (watchOS 8 and older, some apps). Core is the closest stage Kip has.
  [SLEEP_VALUE.asleepUnspecified]: "core",
  [SLEEP_VALUE.awake]: "awake",
  [SLEEP_VALUE.asleepCore]: "core",
  [SLEEP_VALUE.asleepDeep]: "deep",
  [SLEEP_VALUE.asleepREM]: "rem",
};

export function stageOf(value: number): SleepStage | null {
  return STAGE_BY_VALUE[value] ?? null;
}

// London time. NightUpload datetimes carry Europe/London offsets.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Minutes London is ahead of UTC at `at`: 0 in winter, 60 in summer. */
function londonOffsetMinutes(at: Date): number {
  const local = toLocalTime(at);
  const wall = Date.parse(`${local.date}T00:00:00Z`) + local.minutes * MINUTE;
  return Math.round((wall - Math.floor(at.getTime() / MINUTE) * MINUTE) / MINUTE);
}

/** `at` as London wall time with its offset, in whole seconds: "2026-11-14T23:05:07+00:00". */
export function londonIso(at: Date): string {
  const offset = londonOffsetMinutes(at);
  const wall = new Date(Math.floor(at.getTime() / SECOND) * SECOND + offset * MINUTE);
  const sign = offset < 0 ? "-" : "+";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${wall.toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
}

/** The moment London's clock reads `minutes` past midnight on `date`. Exact away from 01:00 to 02:00. */
function londonMoment(date: string, minutes: number): Date {
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  return new Date(wall - londonOffsetMinutes(new Date(wall)) * MINUTE);
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * The window to read for a night, named by its evening's London date (`nightOf`): 18:00 to
 * 12:00 the next day. Wider than the 23:00 to 07:00 Lnight window, so a whole sleep session fits.
 */
export function nightWindow(night: string): SleepWindow {
  return { start: londonMoment(night, 18 * 60), end: londonMoment(addDays(night, 1), 12 * 60) };
}

/** The night most recently slept: in the morning the one just ended, and still that one all day. */
export function lastNight(now: Date): string {
  return nightOf(new Date(now.getTime() - 12 * HOUR));
}

/** `count` nights back from `lastNight`, newest first. */
export function recentNights(count: number, now: Date): string[] {
  const last = lastNight(now);
  return Array.from({ length: count }, (_, back) => addDays(last, -back));
}

// HealthKit samples to NightUpload.sleep.

type Segment = { start: number; end: number; stage: SleepStage };

const toSecond = (ms: number) => Math.floor(ms / SECOND) * SECOND;
const byStart = (a: Segment, b: Segment) => a.start - b.start || a.end - b.end;

/**
 * Prefer the Watch: the iPhone's "in bed" and other apps' guesses overlap its stages. Without a
 * Watch, keep the one source with the most samples, so two apps never interleave.
 */
function preferWatch(samples: readonly HealthSample[]): {
  picked: HealthSample[];
  fromWatch: boolean;
} {
  const watch = samples.filter((sample) => sample.fromWatch);
  if (watch.length > 0) return { picked: watch, fromWatch: true };
  const counts = new Map<string, number>();
  for (const sample of samples) counts.set(sample.sourceId, (counts.get(sample.sourceId) ?? 0) + 1);
  let top: string | undefined;
  for (const [source, count] of counts) {
    if (top === undefined || count > (counts.get(top) ?? 0)) top = source;
  }
  return { picked: samples.filter((sample) => sample.sourceId === top), fromWatch: false };
}

/** Each segment starts where the previous one ended, so no two stages overlap. */
function trimOverlaps(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of [...segments].sort(byStart)) {
    const start = Math.max(segment.start, out[out.length - 1]?.end ?? segment.start);
    if (segment.end > start) out.push({ ...segment, start });
  }
  return out;
}

/** Joins touching or overlapping segments of one stage. Expects them sorted. */
function joinRuns(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const last = out[out.length - 1];
    if (last && last.stage === segment.stage && segment.start <= last.end) {
      last.end = Math.max(last.end, segment.end);
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

/** The parts of `segment` that no segment in `covered` (sorted, not overlapping) covers. */
function subtract(segment: Segment, covered: readonly Segment[]): Segment[] {
  const pieces: Segment[] = [];
  let start = segment.start;
  for (const cover of covered) {
    if (cover.end <= start) continue;
    if (cover.start >= segment.end) break;
    if (cover.start > start) pieces.push({ ...segment, start, end: cover.start });
    start = Math.max(start, cover.end);
  }
  if (segment.end > start) pieces.push({ ...segment, start });
  return pieces;
}

/** Stages in the window, sorted and not overlapping. "In bed" shows only where no stage is. */
function stagesIn(samples: readonly HealthSample[], window: SleepWindow) {
  const from = window.start.getTime();
  const to = window.end.getTime();
  const { picked, fromWatch } = preferWatch(
    samples.filter(
      (sample) =>
        stageOf(sample.value) !== null &&
        sample.end.getTime() > from &&
        sample.start.getTime() < to,
    ),
  );
  const segments = picked.flatMap((sample): Segment[] => {
    const stage = stageOf(sample.value);
    const start = toSecond(Math.max(sample.start.getTime(), from));
    const end = toSecond(Math.min(sample.end.getTime(), to));
    return stage && end > start ? [{ start, end, stage }] : [];
  });
  const asleep = trimOverlaps(segments.filter((segment) => segment.stage !== "inBed"));
  const inBed = joinRuns(segments.filter((segment) => segment.stage === "inBed").sort(byStart));
  const gaps = inBed.flatMap((segment) => subtract(segment, asleep));
  return { segments: joinRuns([...asleep, ...gaps].sort(byStart)), fromWatch };
}

/** [epoch seconds, value] by start time, one per second, to 0.1 of the unit. */
function vitalsIn(samples: readonly HealthSample[], window: SleepWindow) {
  const from = window.start.getTime();
  const to = window.end.getTime();
  const { picked, fromWatch } = preferWatch(
    samples.filter((sample) => sample.start.getTime() >= from && sample.start.getTime() < to),
  );
  const points: Point[] = [];
  for (const sample of [...picked].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const t = Math.floor(sample.start.getTime() / SECOND);
    if (points[points.length - 1]?.[0] === t) continue;
    points.push([t, Math.round(sample.value * 10) / 10]);
  }
  return { points, fromWatch };
}

/** One night of Watch data, shaped for `NightUpload.sleep`. */
export type NightRead = {
  sleep: NightSleep;
  /** First and last moment with data, as London datetimes */
  startedAt: string;
  endedAt: string;
  /** The stages (or, with no stages, the first vital) came from an Apple Watch */
  fromWatch: boolean;
};

/** Null when HealthKit has nothing for the window, so the upload leaves `sleep` out. */
export function toNightRead(raw: RawHealth, window: SleepWindow): NightRead | null {
  const stages = stagesIn(raw.stages, window);
  const vitals = [raw.heartRate, raw.hrv, raw.respiratoryRate].map((samples) =>
    vitalsIn(samples, window),
  );
  const [heartRate, hrv, respiratoryRate] = vitals;
  if (!heartRate || !hrv || !respiratoryRate) return null;

  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const segment of stages.segments) {
    first = Math.min(first, segment.start);
    last = Math.max(last, segment.end);
  }
  for (const { points } of vitals) {
    for (const [t] of points) {
      first = Math.min(first, t * SECOND);
      last = Math.max(last, t * SECOND);
    }
  }
  if (first === Number.POSITIVE_INFINITY) return null;

  const firstSeries = stages.segments.length > 0 ? stages : vitals.find((v) => v.points.length > 0);
  return {
    sleep: {
      stages: stages.segments.map((segment) => ({
        start: londonIso(new Date(segment.start)),
        end: londonIso(new Date(segment.end)),
        stage: segment.stage,
      })),
      heartRate: heartRate.points,
      hrv: hrv.points,
      respiratoryRate: respiratoryRate.points,
    },
    startedAt: londonIso(new Date(first)),
    endedAt: londonIso(new Date(last)),
    fromWatch: firstSeries?.fromWatch ?? false,
  };
}

// The reader: consent first, then HealthKit.

/** What the reader needs from HealthKit. `healthkit.native.ts` implements it on iOS. */
export type HealthPort = {
  /** HealthKit exists here: false on iPad */
  isAvailable(): boolean;
  /** Shows the iOS Health sheet the first time. iOS never says whether reading was allowed. */
  requestRead(): Promise<unknown>;
  read(window: SleepWindow): Promise<RawHealth>;
};

/** The user's health consent in Kip: `useConsent().consent` from the account feature. */
export type HealthConsent = { health: boolean };

type NotRead =
  | { status: "no-consent" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/** `no-data`: no Watch worn, Health access off in iOS, or the sleep session has not ended yet. */
export type WatchNight = NotRead | { status: "no-data" } | ({ status: "ok" } & NightRead);
export type PastNight = NightRead & { night: string };
export type PastNights = NotRead | { status: "no-data" } | { status: "ok"; nights: PastNight[] };

export type WatchSleepReader = {
  /** One window, e.g. a recording's start to stop */
  readWindow(window: SleepWindow, consent: HealthConsent): Promise<WatchNight>;
  /** A night by its evening's London date, over its `nightWindow` */
  readNight(night: string, consent: HealthConsent): Promise<WatchNight>;
  /** The nights that have data, newest first, from one HealthKit read: for pooling */
  readPastNights(nights: readonly string[], consent: HealthConsent): Promise<PastNights>;
};

/** `port` is null where there is no HealthKit at all (the web). The reader never throws. */
export function createWatchSleepReader(port: HealthPort | null): WatchSleepReader {
  async function withHealth<T>(
    consent: HealthConsent,
    run: (health: HealthPort) => Promise<T>,
  ): Promise<T | NotRead> {
    // No HealthKit at all (the web): nothing to ask for, whatever the consent.
    if (!port) return { status: "unavailable" };
    // docs/DOMAIN.md, Privacy: no HealthKit call, not even the iOS sheet, before consent in Kip.
    if (!consent.health) return { status: "no-consent" };
    try {
      if (!port.isAvailable()) return { status: "unavailable" };
      await port.requestRead();
      return await run(port);
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  function readWindow(window: SleepWindow, consent: HealthConsent): Promise<WatchNight> {
    return withHealth(consent, async (health): Promise<WatchNight> => {
      const read = toNightRead(await health.read(window), window);
      return read ? { status: "ok", ...read } : { status: "no-data" };
    });
  }

  return {
    readWindow,
    readNight: (night, consent) => readWindow(nightWindow(night), consent),
    readPastNights: (nights, consent) =>
      withHealth(consent, async (health): Promise<PastNights> => {
        const newest = [...new Set(nights)].sort().reverse();
        const latest = newest[0];
        const oldest = newest[newest.length - 1];
        if (!latest || !oldest) return { status: "no-data" };
        const raw = await health.read({
          start: nightWindow(oldest).start,
          end: nightWindow(latest).end,
        });
        const found = newest.flatMap((night): PastNight[] => {
          const read = toNightRead(raw, nightWindow(night));
          return read ? [{ night, ...read }] : [];
        });
        return found.length > 0 ? { status: "ok", nights: found } : { status: "no-data" };
      }),
  };
}
