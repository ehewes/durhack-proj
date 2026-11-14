/** Relative dB above the rolling-median baseline that counts as a spike. */
export const SPIKE_THRESHOLD_DB = 10;

/** Trailing window for the rolling-median baseline, in seconds. */
export const SPIKE_BASELINE_WINDOW_SECONDS = 300;

/** Samples the trailing window must hold before a baseline exists. */
export const SPIKE_MIN_BASELINE_SAMPLES = 30;

/**
 * Loud samples farther apart than this are separate spikes.
 * 1 Hz sampling sits well inside the gap.
 */
export const SPIKE_MAX_GAP_SECONDS = 2;

/** One excursion above the night's own baseline. Times are epoch seconds. */
export type Spike = {
  /** Epoch seconds of the loudest sample in the excursion. */
  t: number;
  /** Relative dB at that peak. */
  peakDb: number;
};

type Point = { t: number; db: number; index: number };

/**
 * Turns 1 Hz relative dB into spikes: a sample at least `SPIKE_THRESHOLD_DB` above the
 * trailing rolling median (docs/DOMAIN.md, "Bedroom noise"). One spike per excursion,
 * timed at its peak. The current sample is not part of its own baseline.
 */
export function detectSpikes(samples: readonly (readonly [number, number])[]): Spike[] {
  const points: Point[] = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const [t, db] = sample;
    if (!Number.isFinite(t) || !Number.isFinite(db)) continue;
    points.push({ t, db, index: i });
  }
  points.sort((a, b) => a.t - b.t || a.index - b.index);

  const spikes: Spike[] = [];
  let windowStart = 0;
  let open: { t: number; peakDb: number; lastT: number } | null = null;

  const close = () => {
    if (!open) return;
    spikes.push({ t: open.t, peakDb: open.peakDb });
    open = null;
  };

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;

    while (windowStart < i) {
      const older = points[windowStart];
      if (!older || older.t >= point.t - SPIKE_BASELINE_WINDOW_SECONDS) break;
      windowStart += 1;
    }

    if (open && point.t - open.lastT > SPIKE_MAX_GAP_SECONDS) close();

    const count = i - windowStart;
    if (count < SPIKE_MIN_BASELINE_SAMPLES) {
      close();
      continue;
    }

    const levels: number[] = [];
    for (let j = windowStart; j < i; j++) {
      const prior = points[j];
      if (prior) levels.push(prior.db);
    }
    const elevated = point.db >= median(levels) + SPIKE_THRESHOLD_DB;
    if (!elevated) {
      close();
      continue;
    }
    if (!open) {
      open = { t: point.t, peakDb: point.db, lastT: point.t };
    } else {
      if (point.db > open.peakDb) {
        open.t = point.t;
        open.peakDb = point.db;
      }
      open.lastT = point.t;
    }
  }
  close();
  return spikes;
}

/** Arithmetic median. An even count averages the two middle values. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const upper = sorted[mid];
  if (upper === undefined) return Number.NaN;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  if (lower === undefined) return upper;
  return (lower + upper) / 2;
}
