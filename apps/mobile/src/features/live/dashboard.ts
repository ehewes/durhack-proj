import type { LiveEvent, LiveSample, LiveStreamItem } from "@kip/shared/live";

/** How many recent readings the meter keeps on screen. */
export const SAMPLE_WINDOW = 40;

export type StreamFailure = {
  code?: string;
  message: string;
};

export type StreamHandlers = {
  onStarted: () => void;
  onItem: (item: LiveStreamItem) => void;
  onError: (error: StreamFailure) => void;
};

/** Something that pushes `live.stream` items. Tests pass a fake. The screen uses SSE. */
export type LiveSubscription = {
  start: (handlers: StreamHandlers) => () => void;
};

export type DashboardState = {
  /** `simulated` is the labelled development stream, never a live microphone. */
  source: "live" | "simulated";
  status: "connecting" | "open" | "error";
  db: number | null;
  samples: LiveSample[];
  event: LiveEvent | null;
};

export function emptyDashboard(): DashboardState {
  return { source: "live", status: "connecting", db: null, samples: [], event: null };
}

export function reduceItem(state: DashboardState, item: LiveStreamItem): DashboardState {
  if (item.type === "sample") {
    const samples = [...state.samples, item.sample].slice(-SAMPLE_WINDOW);
    return { ...state, status: "open", db: item.sample.db, samples };
  }
  return { ...state, status: "open", event: item.event };
}

const noReading = (state: DashboardState) => state.db === null && state.event === null;

/**
 * Subscribe to `live.stream`. A NOT_IMPLEMENTED server (and, in development, a
 * failed first connection) switches to the labelled demo stream.
 */
export function attachLiveDashboard(opts: {
  server: LiveSubscription;
  mock: LiveSubscription;
  mockWhenDevConnectionFails?: boolean;
  onChange: (state: DashboardState) => void;
}): () => void {
  let state = emptyDashboard();
  let activeStop = () => {};
  let generation = 0;
  let stopped = false;

  const publish = (next: DashboardState) => {
    state = next;
    opts.onChange(state);
  };

  const start = (sub: LiveSubscription, source: DashboardState["source"]) => {
    if (stopped) return;
    const gen = ++generation;
    activeStop();
    activeStop = () => {};
    publish({ ...emptyDashboard(), source, status: "connecting" });
    const stop = sub.start({
      onStarted() {
        if (gen !== generation) return;
      },
      onItem(item) {
        if (gen !== generation) return;
        publish(reduceItem(state, item));
      },
      onError(error) {
        if (gen !== generation) return;
        const stub = error.code === "NOT_IMPLEMENTED";
        const devFail = opts.mockWhenDevConnectionFails === true;
        if (source === "live" && noReading(state) && (stub || devFail)) {
          start(opts.mock, "simulated");
          return;
        }
        publish({ ...state, status: "error" });
      },
    });
    if (gen !== generation) stop();
    else activeStop = stop;
  };

  start(opts.server, "live");
  return () => {
    stopped = true;
    generation += 1;
    activeStop();
    activeStop = () => {};
  };
}
