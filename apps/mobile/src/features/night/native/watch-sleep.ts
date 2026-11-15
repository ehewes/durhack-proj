import type { AccountView } from "@kip/shared/account";
import { NIGHT_END_MINUTES, NIGHT_START_MINUTES, toLocalTime } from "@kip/shared/domain";
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

// `asleepUnspecified` (watchOS 8 and older, some apps) has no stage in NightUpload, so it is left
// out rather than shown as a stage the device never measured.
const STAGE_BY_VALUE: Record<number, SleepStage> = {
  [SLEEP_VALUE.inBed]: "inBed",
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

/** 23:00 to 07:00 London, the Lnight window: where a night without sleep stages keeps its vitals. */
export function quietWindow(night: string): SleepWindow {
  return {
    start: londonMoment(night, NIGHT_START_MINUTES),
    end: londonMoment(addDays(night, 1), NIGHT_END_MINUTES),
  };
}

/** London clock time from which the night just slept counts as "last night". */
const LAST_NIGHT_FROM_MINUTES = 6 * 60;

/**
 * The night most recently slept, by London's calendar: from 06:00 it is the one that began
 * yesterday evening, and in the small hours, while a night is still in progress, the one before.
 * Calendar dates, not elapsed hours, so the clock changes do not move the 06:00 switch.
 */
export function lastNight(now: Date): string {
  const local = toLocalTime(now);
  return addDays(local.date, local.minutes >= LAST_NIGHT_FROM_MINUTES ? -1 : -2);
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
 * One source per series, so two never interleave. The Watch's own tracking (Apple's
 * `com.apple.health.*` sources on a Watch) beats sleep apps on the Watch, which beat the iPhone's
 * "in bed" and other apps. Within the winner, the source with the most samples.
 */
function preferWatch(samples: readonly HealthSample[]): {
  picked: HealthSample[];
  fromWatch: boolean;
} {
  const watch = samples.filter((sample) => sample.fromWatch);
  const apple = watch.filter((sample) => sample.sourceId.startsWith("com.apple.health"));
  const pool = apple.length > 0 ? apple : watch.length > 0 ? watch : samples;
  const counts = new Map<string, number>();
  for (const sample of pool) counts.set(sample.sourceId, (counts.get(sample.sourceId) ?? 0) + 1);
  let top: string | undefined;
  for (const [source, count] of counts) {
    if (top === undefined || count > (counts.get(top) ?? 0)) top = source;
  }
  return { picked: pool.filter((sample) => sample.sourceId === top), fromWatch: watch.length > 0 };
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
  return { segments: mainSession(joinRuns([...asleep, ...gaps].sort(byStart))), fromWatch };
}

/** A break this long between stages starts a new sleep session, e.g. an evening nap. */
const SESSION_GAP_MS = 90 * MINUTE;

/**
 * The night's main sleep session: the run of stages with the most time asleep. An evening nap
 * or a session clipped at 18:00 stays out, so the hours between never count as sleep.
 */
function mainSession(segments: readonly Segment[]): Segment[] {
  const sessions: Segment[][] = [];
  for (const segment of segments) {
    const current = sessions[sessions.length - 1];
    const previous = current?.[current.length - 1];
    if (current && previous && segment.start - previous.end < SESSION_GAP_MS) current.push(segment);
    else sessions.push([segment]);
  }
  const asleepMs = (session: readonly Segment[]) =>
    session.reduce(
      (sum, s) => (s.stage === "inBed" || s.stage === "awake" ? sum : sum + s.end - s.start),
      0,
    );
  let best: Segment[] = [];
  for (const session of sessions) {
    if (best.length === 0 || asleepMs(session) > asleepMs(best)) best = session;
  }
  return best;
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
  /** The sleep session (first to last stage), or first to last vital without stages, London time */
  startedAt: string;
  endedAt: string;
  /** The stages (or, with no stages, the first vital) came from an Apple Watch */
  fromWatch: boolean;
};

/**
 * Null when HealthKit has nothing, so the upload leaves `sleep` out. Vitals are kept only inside
 * the sleep session, so waking hours (an evening workout, the morning commute) never count as
 * sleep. A night without stages keeps the vitals inside `quiet`, by default the whole window.
 */
export function toNightRead(
  raw: RawHealth,
  window: SleepWindow,
  quiet: SleepWindow = window,
): NightRead | null {
  const stages = stagesIn(raw.stages, window);
  const first = stages.segments[0];
  const last = stages.segments[stages.segments.length - 1];
  const session: SleepWindow =
    first && last
      ? { start: new Date(first.start), end: new Date(last.end + SECOND) }
      : {
          start: new Date(Math.max(window.start.getTime(), quiet.start.getTime())),
          end: new Date(Math.min(window.end.getTime(), quiet.end.getTime())),
        };
  const vitals = [raw.heartRate, raw.hrv, raw.respiratoryRate].map((samples) =>
    vitalsIn(samples, session),
  );
  const [heartRate, hrv, respiratoryRate] = vitals;
  if (!heartRate || !hrv || !respiratoryRate) return null;

  let from = first?.start ?? Number.POSITIVE_INFINITY;
  let to = last?.end ?? Number.NEGATIVE_INFINITY;
  if (!first) {
    for (const { points } of vitals) {
      for (const [t] of points) {
        from = Math.min(from, t * SECOND);
        to = Math.max(to, t * SECOND);
      }
    }
  }
  if (from === Number.POSITIVE_INFINITY) return null;

  const firstSeries = first ? stages : vitals.find((v) => v.points.length > 0);
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
    startedAt: londonIso(new Date(from)),
    endedAt: londonIso(new Date(to)),
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
  /** Samples overlapping any of the windows, in one query per data type */
  read(windows: readonly SleepWindow[]): Promise<RawHealth>;
};

/** A HealthKit sample filter for the windows: one date range, or an OR of several in one query. */
export function healthKitFilter(windows: readonly SleepWindow[]) {
  const dates = windows.map((window) => ({
    date: { startDate: window.start, endDate: window.end },
  }));
  const [only] = dates;
  return dates.length === 1 && only ? only : { OR: dates };
}

/**
 * How long a read stays fresh. Only a night with data keeps for 10 minutes. Anything else
 * (no consent while the account reloads, no data before stages sync) is read again next time.
 */
export function watchNightStaleMs(result: { status: string } | undefined): number {
  return result?.status === "ok" ? 10 * MINUTE : 0;
}

/** The user's health consent in Kip. */
export type HealthConsent = { health: boolean };

/**
 * Health consent as the account says right now: off until the user has answered. Read it when a
 * HealthKit read starts, not when the screen rendered: "delete everything" resets every query,
 * and a reset refetches before the account has loaded again.
 */
export function healthConsentOf(view: AccountView | undefined): HealthConsent {
  return { health: view !== undefined && view.consentUpdatedAt !== null && view.consent.health };
}

type NotRead =
  | { status: "no-consent" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/**
 * `no-data`: no Watch worn, or Health access off in iOS. Before the sleep session ends a night
 * can be `ok` with vitals and no stages yet: stages reach Apple Health once the user wakes.
 */
export type WatchNight = NotRead | { status: "no-data" } | ({ status: "ok" } & NightRead);
export type PastNight = NightRead & { night: string };
export type PastNights = NotRead | { status: "no-data" } | { status: "ok"; nights: PastNight[] };

export type WatchSleepReader = {
  /** One window, e.g. a recording's start to stop */
  readWindow(window: SleepWindow, consent: HealthConsent): Promise<WatchNight>;
  /** A night by its evening's London date, over its `nightWindow` */
  readNight(night: string, consent: HealthConsent): Promise<WatchNight>;
  /** The nights that have data, newest first, from one read of their windows: for pooling */
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

  const asWatchNight = (read: NightRead | null): WatchNight =>
    read ? { status: "ok", ...read } : { status: "no-data" };

  return {
    readWindow: (window, consent) =>
      withHealth(consent, async (health) =>
        asWatchNight(toNightRead(await health.read([window]), window)),
      ),
    readNight: (night, consent) =>
      withHealth(consent, async (health) => {
        const window = nightWindow(night);
        return asWatchNight(toNightRead(await health.read([window]), window, quietWindow(night)));
      }),
    readPastNights: (nights, consent) =>
      withHealth(consent, async (health): Promise<PastNights> => {
        const newest = [...new Set(nights)].sort().reverse();
        if (newest.length === 0) return { status: "no-data" };
        // Only the nights' own windows, never the afternoons between them.
        const raw = await health.read(newest.map(nightWindow));
        const found = newest.flatMap((night): PastNight[] => {
          const read = toNightRead(raw, nightWindow(night), quietWindow(night));
          return read ? [{ night, ...read }] : [];
        });
        return found.length > 0 ? { status: "ok", nights: found } : { status: "no-data" };
      }),
  };
}
