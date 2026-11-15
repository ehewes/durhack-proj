import {
  detectSpikes,
  isOutsideRecommendedHours,
  SPIKE_BASELINE_WINDOW_SECONDS,
  type Spike,
} from "@kip/shared/domain";
import {
  type LiveEvent,
  type LivePushInput,
  type LiveSample,
  type LiveSpike,
  type LiveStreamItem,
  liveEvent,
  livePushInput,
  liveStreamItem,
} from "@kip/shared/live";

/** One demo keeps this many seconds of 1 Hz samples in memory. */
const SESSION_SECONDS = 15 * 60;

export type LivePushResult = {
  /** Samples stored on the session and sent to every viewer. */
  samples: number;
  /**
   * Spike events this push confirmed. Empty while the loud excursion is still
   * open: the next sample closes it.
   */
  events: LiveEvent[];
};

type Subscriber = {
  push(item: LiveStreamItem): void;
};

type Session = {
  samples: LiveSample[];
  items: LiveStreamItem[];
  emitted: Set<number>;
  /** Confirmed spikes by peak time, so a clip that arrives later can find its spike. */
  spikes: Map<number, LiveSpike>;
  subscribers: Set<Subscriber>;
};

const session: Session = {
  samples: [],
  items: [],
  emitted: new Set(),
  spikes: new Map(),
  subscribers: new Set(),
};

/**
 * The demo has one in-memory session. Every dashboard subscriber receives
 * every phone's samples. Tests call this between cases.
 */
export function resetLiveSession(): void {
  session.samples.length = 0;
  session.items.length = 0;
  session.emitted.clear();
  session.spikes.clear();
  session.subscribers.clear();
}

/**
 * Store a batch and fan it out. Spikes use the shared rolling-median rule
 * (docs/DOMAIN.md). An excursion is confirmed only once the newest sample
 * leaves it unchanged: `detectSpikes` also closes a spike at the end of its
 * input, which would fire on a loud sample before the next second arrives.
 * Confirmed spikes go out as events labelled `uncertain`, with no briefing
 * audio, until labelling publishes a classification.
 */
export function pushLiveSamples(input: LivePushInput): LivePushResult {
  const batch = livePushInput.parse(input);
  for (const sample of batch.samples) {
    session.samples.push(sample);
    publish(liveStreamItem.parse({ type: "sample", sample }));
  }

  const events: LiveEvent[] = [];
  for (const spike of closedSpikes(session.samples)) {
    if (session.emitted.has(spike.t)) continue;
    session.emitted.add(spike.t);
    const confirmed: LiveSpike = {
      t: spike.t,
      peakDb: spike.peakDb,
      baselineDb: baselineDb(session.samples, spike.t),
    };
    session.spikes.set(spike.t, confirmed);
    const event = liveEvent.parse({
      spike: confirmed,
      label: "uncertain",
      outsideRecommendedHours: isOutsideRecommendedHours(new Date(spike.t * 1000)),
      briefingAudioUrl: null,
    });
    publish(liveStreamItem.parse({ type: "event", event }));
    events.push(event);
  }

  trim();
  return { samples: batch.samples.length, events };
}

/** The confirmed spike whose peak is nearest `t`, within `withinSeconds`; null if none. */
export function spikeNear(t: number, withinSeconds: number): LiveSpike | null {
  let best: LiveSpike | null = null;
  for (const spike of session.spikes.values()) {
    const gap = Math.abs(spike.t - t);
    if (gap > withinSeconds) continue;
    if (!best || gap < Math.abs(best.t - t)) best = spike;
  }
  return best;
}

/** Send one finished event to every viewer. It replaces the earlier event for the same spike. */
export function publishLiveEvent(input: LiveEvent): LiveEvent {
  const event = liveEvent.parse(input);
  publish(liveStreamItem.parse({ type: "event", event }));
  return event;
}

/** Replay the retained window, then each later push, until `signal` aborts. */
export async function* streamLive(signal?: AbortSignal): AsyncGenerator<LiveStreamItem> {
  const queue: LiveStreamItem[] = [];
  let wake: (() => void) | undefined;
  const subscriber: Subscriber = {
    push(item) {
      queue.push(item);
      wake?.();
    },
  };
  const snapshot = session.items.slice();
  session.subscribers.add(subscriber);
  const onAbort = () => wake?.();
  signal?.addEventListener("abort", onAbort);
  try {
    for (const item of snapshot) {
      if (signal?.aborted) return;
      yield item;
    }
    while (!signal?.aborted) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    session.subscribers.delete(subscriber);
  }
}

function publish(item: LiveStreamItem): void {
  session.items.push(item);
  for (const subscriber of session.subscribers) subscriber.push(item);
}

function trim(): void {
  if (session.samples.length > SESSION_SECONDS) {
    session.samples.splice(0, session.samples.length - SESSION_SECONDS);
  }
  if (session.items.length > SESSION_SECONDS) {
    session.items.splice(0, session.items.length - SESSION_SECONDS);
  }
  const oldest = session.samples[0]?.t;
  if (oldest === undefined) {
    session.emitted.clear();
    session.spikes.clear();
    return;
  }
  for (const t of session.emitted) {
    if (t < oldest) session.emitted.delete(t);
  }
  for (const t of session.spikes.keys()) {
    if (t < oldest) session.spikes.delete(t);
  }
}

/**
 * Spikes that `detectSpikes` still reports after the newest sample is removed.
 * Those have already ended. A spike that appears only because the series ends
 * on a loud sample is still open.
 */
function closedSpikes(samples: readonly LiveSample[]): Spike[] {
  if (samples.length < 2) return [];
  const ordered = [...samples].sort((a, b) => a.t - b.t);
  const pairs = ordered.map((sample) => [sample.t, sample.db] as const);
  const confirmed = detectSpikes(pairs);
  const prior = detectSpikes(pairs.slice(0, -1));
  return confirmed.filter((spike) =>
    prior.some((earlier) => earlier.t === spike.t && earlier.peakDb === spike.peakDb),
  );
}

/** Median of the trailing window, excluding the peak sample itself. */
function baselineDb(samples: readonly LiveSample[], spikeT: number): number {
  const start = spikeT - SPIKE_BASELINE_WINDOW_SECONDS;
  const levels: number[] = [];
  for (const sample of samples) {
    if (sample.t >= start && sample.t < spikeT) levels.push(sample.db);
  }
  return median(levels);
}

/** Arithmetic median. An even count averages the two middle values. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const upper = sorted[mid];
  if (upper === undefined) throw new Error("Spike baseline has no samples");
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  if (lower === undefined) return upper;
  return (lower + upper) / 2;
}
