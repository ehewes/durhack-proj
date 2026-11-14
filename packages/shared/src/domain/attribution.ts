/** Look-back window before a wake-up in which a spike counts, in seconds (docs/DOMAIN.md). */
export const ATTRIBUTION_WINDOW_SECONDS = { min: 60, max: 120 } as const;

/** Show percentages only once this many nights are pooled; below it, show counts.
 *  Provisional: the plan says "several nights". Tune with real data. */
export const MIN_NIGHTS_FOR_PERCENTAGE = 5;

/** Beats per minute a reading must rise, against the previous sample, to count as a wake-up. */
export const HEART_RATE_JUMP_BPM = 10;

/** The rise must happen within this many seconds to count as sudden. */
export const HEART_RATE_JUMP_MAX_GAP_SECONDS = 120;

/** Random windows drawn from the night when measuring the chance a window holds a spike. */
export const RANDOM_WINDOW_COUNT = 1000;

/** Matches the night upload's sleep stages. `inBed` is not a wake-up. */
export const SLEEP_STAGES = ["inBed", "awake", "core", "deep", "rem"] as const;
export type SleepStage = (typeof SLEEP_STAGES)[number];

const ASLEEP = new Set<SleepStage>(["core", "deep", "rem"]);

export type StageInterval = {
  /** Epoch seconds */
  start: number;
  end: number;
  stage: SleepStage;
};

export type WakeUp = {
  /** Epoch seconds */
  t: number;
  source: "stage" | "heartRate";
};

export type WakeUpLink = {
  wakeUps: number;
  /** Wake-ups with a spike in the 60 to 120 seconds before them. */
  followedSpike: number;
  /** Share of random windows from this night that contained a spike. */
  baselineRate: number;
};

export type AttributionSummary =
  | {
      display: "counts";
      nightsPooled: number;
      wakeUps: number;
      followedSpike: number;
    }
  | {
      display: "percentage";
      nightsPooled: number;
      wakeUps: number;
      followedSpike: number;
      /** 100 * followedSpike / wakeUps. */
      percent: number;
    };

/**
 * Wake-ups during a sleep session (docs/DOMAIN.md, "Wake-up attribution").
 * An awake stage counts when it begins in the session at or after sleep onset
 * (the first core, deep or rem). The awake stretch before falling asleep does not.
 * A heart-rate jump is a rise of `HEART_RATE_JUMP_BPM` within
 * `HEART_RATE_JUMP_MAX_GAP_SECONDS`, one wake-up per run of rises. When `stages`
 * is passed, jumps count only during core, deep or rem. When it is omitted, jumps
 * anywhere in the session count.
 */
export function detectWakeUps(input: {
  sessionStart: number;
  sessionEnd: number;
  stages?: readonly StageInterval[];
  /** [epoch seconds, beats per minute] */
  heartRate?: readonly (readonly [number, number])[];
}): WakeUp[] {
  const { sessionStart, sessionEnd } = input;
  if (
    !Number.isFinite(sessionStart) ||
    !Number.isFinite(sessionEnd) ||
    sessionEnd <= sessionStart
  ) {
    return [];
  }

  const found: WakeUp[] = [];
  const stages = input.stages;
  if (stages) {
    const onset = sleepOnset(stages, sessionStart, sessionEnd);
    if (onset !== null) {
      for (const stage of stages) {
        if (stage.stage !== "awake") continue;
        if (!Number.isFinite(stage.start) || !Number.isFinite(stage.end)) continue;
        if (stage.end <= stage.start) continue;
        if (stage.start < sessionStart || stage.start >= sessionEnd) continue;
        if (stage.start < onset) continue;
        found.push({ t: stage.start, source: "stage" });
      }
    }
  }

  const heart = heartSamples(input.heartRate, sessionStart, sessionEnd);
  let rising = false;
  for (let i = 1; i < heart.length; i++) {
    const prev = heart[i - 1];
    const curr = heart[i];
    if (!prev || !curr) continue;
    const sudden =
      curr.t - prev.t <= HEART_RATE_JUMP_MAX_GAP_SECONDS &&
      curr.bpm - prev.bpm >= HEART_RATE_JUMP_BPM;
    if (!sudden) {
      rising = false;
      continue;
    }
    if (!rising && (!stages || asleepAt(stages, curr.t))) {
      found.push({ t: curr.t, source: "heartRate" });
    }
    rising = true;
  }

  found.sort((a, b) => a.t - b.t || sourceRank(a.source) - sourceRank(b.source));
  return found;
}

/**
 * Counts wake-ups that a spike preceded by 60 to 120 seconds, and the share of
 * random windows of that same length (seeded) that contain a spike.
 * The same night and seed always return the same baseline rate.
 */
export function linkWakeUps(input: {
  spikes: readonly { t: number }[];
  wakeUps: readonly { t: number }[];
  /** Epoch seconds */
  nightStart: number;
  nightEnd: number;
  seed: number;
}): WakeUpLink {
  const times = input.spikes.map((spike) => spike.t).filter((t) => Number.isFinite(t));
  times.sort((a, b) => a - b);

  let wakeUps = 0;
  let followedSpike = 0;
  for (const wake of input.wakeUps) {
    if (!Number.isFinite(wake.t)) continue;
    wakeUps += 1;
    const start = wake.t - ATTRIBUTION_WINDOW_SECONDS.max;
    const end = wake.t - ATTRIBUTION_WINDOW_SECONDS.min;
    if (hasTimeInRange(times, start, end)) followedSpike += 1;
  }

  return { wakeUps, followedSpike, baselineRate: randomWindowRate(times, input) };
}

/**
 * Sums wake-up counts across nights. A percentage is included only once
 * `MIN_NIGHTS_FOR_PERCENTAGE` nights are pooled and there is at least one wake-up.
 * Fewer nights, or no wake-ups, stay as counts (docs/DOMAIN.md).
 */
export function pooledAttribution(
  nights: readonly { wakeUps: number; followedSpike: number }[],
): AttributionSummary {
  let wakeUps = 0;
  let followedSpike = 0;
  for (const night of nights) {
    wakeUps += night.wakeUps;
    followedSpike += night.followedSpike;
  }
  const nightsPooled = nights.length;
  if (nightsPooled >= MIN_NIGHTS_FOR_PERCENTAGE && wakeUps > 0) {
    return {
      display: "percentage",
      nightsPooled,
      wakeUps,
      followedSpike,
      percent: (followedSpike / wakeUps) * 100,
    };
  }
  return { display: "counts", nightsPooled, wakeUps, followedSpike };
}

function sleepOnset(
  stages: readonly StageInterval[],
  sessionStart: number,
  sessionEnd: number,
): number | null {
  let onset: number | null = null;
  for (const stage of stages) {
    if (!ASLEEP.has(stage.stage)) continue;
    if (!Number.isFinite(stage.start) || !Number.isFinite(stage.end)) continue;
    if (stage.end <= stage.start) continue;
    if (stage.end <= sessionStart || stage.start >= sessionEnd) continue;
    const began = Math.max(stage.start, sessionStart);
    if (onset === null || began < onset) onset = began;
  }
  return onset;
}

function asleepAt(stages: readonly StageInterval[], t: number): boolean {
  for (const stage of stages) {
    if (!ASLEEP.has(stage.stage)) continue;
    if (stage.start <= t && t < stage.end) return true;
  }
  return false;
}

function heartSamples(
  samples: readonly (readonly [number, number])[] | undefined,
  sessionStart: number,
  sessionEnd: number,
): { t: number; bpm: number; index: number }[] {
  if (!samples) return [];
  const points: { t: number; bpm: number; index: number }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const [t, bpm] = sample;
    if (!Number.isFinite(t) || !Number.isFinite(bpm)) continue;
    if (t < sessionStart || t >= sessionEnd) continue;
    points.push({ t, bpm, index: i });
  }
  points.sort((a, b) => a.t - b.t || a.index - b.index);
  return points;
}

function sourceRank(source: WakeUp["source"]): number {
  return source === "stage" ? 0 : 1;
}

function hasTimeInRange(times: readonly number[], start: number, end: number): boolean {
  if (!(end >= start)) return false;
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const value = times[mid];
    if (value !== undefined && value < start) lo = mid + 1;
    else hi = mid;
  }
  const found = times[lo];
  return found !== undefined && found <= end;
}

function randomWindowRate(
  times: readonly number[],
  input: { nightStart: number; nightEnd: number; seed: number },
): number {
  if (times.length === 0) return 0;
  const length = ATTRIBUTION_WINDOW_SECONDS.max - ATTRIBUTION_WINDOW_SECONDS.min;
  const span = input.nightEnd - input.nightStart - length;
  if (!Number.isFinite(input.nightStart) || !Number.isFinite(span) || span < 0) return 0;

  const rand = mulberry32(input.seed);
  let hits = 0;
  for (let i = 0; i < RANDOM_WINDOW_COUNT; i++) {
    const start = input.nightStart + (span === 0 ? 0 : rand() * span);
    if (hasTimeInRange(times, start, start + length)) hits += 1;
  }
  return hits / RANDOM_WINDOW_COUNT;
}

/** Deterministic [0, 1) sequence. Same seed, same draws. */
function mulberry32(seed: number): () => number {
  let state = Number.isFinite(seed) ? seed | 0 : 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
