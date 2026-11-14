import { describe, expect, test } from "bun:test";
import {
  bannedWording,
  OUTSIDE_HOURS_WORDING,
  SAY_RELATIVE_DB,
  SAY_SIMULATED,
} from "@kip/shared/domain";
import { liveStreamItem } from "@kip/shared/live";
import streamFixture from "../../../../../packages/shared/src/live/fixtures/live-stream.json";
import {
  hoursLine,
  labelTitle,
  meterFraction,
  screenLines,
  spikeTimeLine,
  WITHIN_HOURS,
} from "./copy";
import {
  attachLiveDashboard,
  type DashboardState,
  emptyDashboard,
  reduceItem,
  SAMPLE_WINDOW,
} from "./dashboard";
import { createDemoSubscription, demoStreamItems } from "./demo-stream";
import { createServerSubscription, type StreamSubscribe } from "./server-stream";

const fixtureItems = streamFixture.map((item) => liveStreamItem.parse(item));
const eventItem = demoStreamItems.find((item) => item.type === "event");
const event = eventItem?.type === "event" ? eventItem.event : undefined;

function applyAll(source: DashboardState["source"] = "live"): DashboardState {
  return demoStreamItems.reduce(reduceItem, { ...emptyDashboard(), source, status: "connecting" });
}

describe("live dashboard copy", () => {
  test("the demo stream matches the shared live fixture", () => {
    expect(demoStreamItems).toEqual(fixtureItems);
  });

  test("construction outside the recommended hours uses the domain sentence", () => {
    expect(event?.label).toBe("construction");
    expect(event?.outsideRecommendedHours).toBe(true);
    expect(event ? hoursLine(event) : null).toBe(OUTSIDE_HOURS_WORDING);
    expect(labelTitle("construction")).toBe("Construction");
    expect(spikeTimeLine(1763100002)).toBe("Spike at 06:00");
  });

  test("a construction spike inside the hours says so, and other labels have no hours flag", () => {
    expect(event).toBeDefined();
    if (!event) return;
    expect(hoursLine({ ...event, outsideRecommendedHours: false })).toBe(WITHIN_HOURS);
    expect(hoursLine({ ...event, label: "siren", outsideRecommendedHours: true })).toBeNull();
  });

  test("the meter window is clamped", () => {
    expect(meterFraction(20)).toBe(0);
    expect(meterFraction(50)).toBe(0.5);
    expect(meterFraction(80)).toBe(1);
    expect(meterFraction(0)).toBe(0);
    expect(meterFraction(120)).toBe(1);
  });

  test("visible sentences follow the wording rules", () => {
    const states = [
      emptyDashboard(),
      { ...emptyDashboard(), status: "error" as const },
      applyAll("live"),
      applyAll("simulated"),
      event
        ? reduceItem(emptyDashboard(), {
            type: "event",
            event: { ...event, outsideRecommendedHours: false },
          })
        : emptyDashboard(),
    ];
    for (const state of states) {
      for (const line of screenLines(state)) {
        expect(bannedWording(line)).toEqual([]);
      }
    }
    const simulated = screenLines(applyAll("simulated")).join(" ");
    expect(simulated.toLowerCase()).toContain(SAY_SIMULATED);
    expect(simulated).toContain(SAY_RELATIVE_DB);
    expect(simulated).toContain(OUTSIDE_HOURS_WORDING);
    expect(simulated).toContain("Construction");
  });
});

describe("live dashboard state", () => {
  test("samples update the meter and an event keeps the label and hours flag", () => {
    const state = applyAll();
    expect(state.source).toBe("live");
    expect(state.status).toBe("open");
    expect(state.db).toBe(33);
    expect(state.event?.label).toBe("construction");
    expect(state.event?.outsideRecommendedHours).toBe(true);
    expect(state.event?.briefingAudioUrl).toBe("https://kip.example/briefings/live-1.mp3");
    expect(state.samples.map((sample) => sample.db)).toEqual([31.2, 31.8, 52.4, 33]);
  });

  test("the meter keeps only the recent window", () => {
    let state = emptyDashboard();
    for (let i = 0; i < SAMPLE_WINDOW + 5; i += 1) {
      state = reduceItem(state, { type: "sample", sample: { t: i, db: i } });
    }
    expect(state.samples).toHaveLength(SAMPLE_WINDOW);
    expect(state.samples[0]?.db).toBe(5);
    expect(state.db).toBe(SAMPLE_WINDOW + 4);
  });
});

describe("live stream subscription", () => {
  test("the development demo emits the fixture in order and stops cleanly", () => {
    const queued: Array<() => void> = [];
    const got: unknown[] = [];
    const sub = createDemoSubscription({
      schedule(fn) {
        queued.push(fn);
        return () => {
          const index = queued.indexOf(fn);
          if (index >= 0) queued.splice(index, 1);
        };
      },
    });
    const stop = sub.start({
      onStarted() {},
      onItem(item) {
        got.push(item);
      },
      onError() {
        throw new Error("demo stream failed");
      },
    });
    while (queued.length > 0 && got.length < demoStreamItems.length) queued.shift()?.();
    expect(got).toEqual(demoStreamItems);
    expect(queued).toHaveLength(0);
    stop();
  });

  test("stopping the demo cancels the next tick", () => {
    const queued: Array<() => void> = [];
    const sub = createDemoSubscription({
      schedule(fn) {
        queued.push(fn);
        return () => {
          const index = queued.indexOf(fn);
          if (index >= 0) queued.splice(index, 1);
        };
      },
    });
    const stop = sub.start({
      onStarted() {},
      onItem() {},
      onError() {},
    });
    expect(queued).toHaveLength(1);
    stop();
    expect(queued).toHaveLength(0);
  });

  test("a live server updates the meter without the simulated label", () => {
    const seen: DashboardState[] = [];
    const subscribe: StreamSubscribe = (_input, opts) => {
      opts.onStarted?.();
      opts.onData(demoStreamItems[0]);
      opts.onData(demoStreamItems[3]);
      return { unsubscribe() {} };
    };
    attachLiveDashboard({
      server: createServerSubscription(subscribe),
      mock: {
        start() {
          throw new Error("mock started during a live stream");
        },
      },
      onChange: (state) => seen.push(state),
    });
    const last = seen.at(-1);
    expect(last?.source).toBe("live");
    expect(last?.db).toBe(31.2);
    expect(last?.event?.label).toBe("construction");
    expect(last?.event?.outsideRecommendedHours).toBe(true);
  });

  test("an unimplemented server plays the labelled demo and closes the stub", () => {
    const seen: DashboardState[] = [];
    let unsubscribed = 0;
    let mockStarts = 0;
    const subscribe: StreamSubscribe = (_input, opts) => {
      opts.onError({ data: { code: "NOT_IMPLEMENTED" }, message: "Not built yet" });
      return {
        unsubscribe() {
          unsubscribed += 1;
        },
      };
    };
    attachLiveDashboard({
      server: createServerSubscription(subscribe),
      mock: {
        start(handlers) {
          mockStarts += 1;
          handlers.onStarted();
          const sample = demoStreamItems[0];
          const spike = demoStreamItems[3];
          if (sample) handlers.onItem(sample);
          if (spike) handlers.onItem(spike);
          return () => {};
        },
      },
      onChange: (state) => seen.push(state),
    });
    const last = seen.at(-1);
    expect(mockStarts).toBe(1);
    expect(unsubscribed).toBe(1);
    expect(last?.source).toBe("simulated");
    expect(last?.status).toBe("open");
    expect(last?.event?.label).toBe("construction");
    expect(
      screenLines(last ?? emptyDashboard())
        .join(" ")
        .toLowerCase(),
    ).toContain(SAY_SIMULATED);
  });

  test("a bad payload is an error and does not pretend to be live", () => {
    const seen: DashboardState[] = [];
    const subscribe: StreamSubscribe = (_input, opts) => {
      opts.onData({ type: "sample", sample: { t: 1 } });
      return { unsubscribe() {} };
    };
    attachLiveDashboard({
      server: createServerSubscription(subscribe),
      mock: {
        start() {
          throw new Error("mock started for a bad payload");
        },
      },
      onChange: (state) => seen.push(state),
    });
    expect(seen.at(-1)?.status).toBe("error");
    expect(seen.at(-1)?.source).toBe("live");
    expect(seen.at(-1)?.db).toBeNull();
  });

  test("a dropped connection in development uses the labelled demo", () => {
    const seen: DashboardState[] = [];
    const subscribe: StreamSubscribe = (_input, opts) => {
      opts.onError(new Error("network down"));
      return { unsubscribe() {} };
    };
    attachLiveDashboard({
      server: createServerSubscription(subscribe),
      mock: {
        start(handlers) {
          handlers.onStarted();
          return () => {};
        },
      },
      mockWhenDevConnectionFails: true,
      onChange: (state) => seen.push(state),
    });
    expect(seen.at(-1)?.source).toBe("simulated");
  });

  test("a dropped connection outside development stays an error", () => {
    const seen: DashboardState[] = [];
    const subscribe: StreamSubscribe = (_input, opts) => {
      opts.onError(new Error("network down"));
      return { unsubscribe() {} };
    };
    attachLiveDashboard({
      server: createServerSubscription(subscribe),
      mock: {
        start() {
          throw new Error("mock started outside development");
        },
      },
      onChange: (state) => seen.push(state),
    });
    expect(seen.at(-1)?.status).toBe("error");
    expect(seen.at(-1)?.source).toBe("live");
  });
});
