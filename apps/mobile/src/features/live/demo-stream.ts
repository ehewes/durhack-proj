import { type LiveStreamItem, liveStreamItem } from "@kip/shared/live";
import type { LiveSubscription } from "./dashboard";

/**
 * Development demo, one item per second. Kept equal to
 * `packages/shared/src/live/fixtures/live-stream.json` by the feature test.
 */
const DEMO_STREAM: readonly LiveStreamItem[] = [
  { type: "sample", sample: { t: 1763100000, db: 31.2 } },
  { type: "sample", sample: { t: 1763100001, db: 31.8 } },
  { type: "sample", sample: { t: 1763100002, db: 52.4 } },
  {
    type: "event",
    event: {
      spike: { t: 1763100002, peakDb: 52.4, baselineDb: 31.5 },
      label: "construction",
      outsideRecommendedHours: true,
      briefingAudioUrl: "https://kip.example/briefings/live-1.mp3",
    },
  },
  { type: "sample", sample: { t: 1763100003, db: 33.0 } },
];

export const demoStreamItems: LiveStreamItem[] = DEMO_STREAM.map((item) =>
  liveStreamItem.parse(item),
);

/** One reading per second, the same pace as the phone. */
export const DEMO_TICK_MS = 1000;

export function createDemoSubscription(opts?: {
  items?: readonly LiveStreamItem[];
  tickMs?: number;
  schedule?: (fn: () => void, ms: number) => () => void;
}): LiveSubscription {
  const items = opts?.items ?? demoStreamItems;
  const tickMs = opts?.tickMs ?? DEMO_TICK_MS;
  const schedule =
    opts?.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });
  return {
    start(handlers) {
      let index = 0;
      let cancel = () => {};
      let stopped = false;
      const emit = () => {
        if (stopped) return;
        const item = items[index];
        if (!item) return;
        handlers.onItem(item);
        index += 1;
        if (index < items.length) cancel = schedule(emit, tickMs);
      };
      handlers.onStarted();
      cancel = schedule(emit, 0);
      return () => {
        stopped = true;
        cancel();
      };
    },
  };
}
