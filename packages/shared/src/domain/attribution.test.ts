import { describe, expect, test } from "bun:test";
import {
  ATTRIBUTION_WINDOW_SECONDS,
  detectWakeUps,
  HEART_RATE_JUMP_BPM,
  HEART_RATE_JUMP_MAX_GAP_SECONDS,
  linkWakeUps,
  MIN_NIGHTS_FOR_PERCENTAGE,
  pooledAttribution,
  RANDOM_WINDOW_COUNT,
  type StageInterval,
} from "./attribution";

const session = { sessionStart: 0, sessionEnd: 10_000 };

function stages(...rows: [number, number, StageInterval["stage"]][]): StageInterval[] {
  return rows.map(([start, end, stage]) => ({ start, end, stage }));
}

describe("detectWakeUps", () => {
  test("counts awake stages after sleep has started", () => {
    const found = detectWakeUps({
      ...session,
      stages: stages(
        [0, 100, "awake"],
        [100, 500, "core"],
        [500, 560, "awake"],
        [560, 800, "deep"],
        [800, 900, "inBed"],
        [900, 940, "rem"],
      ),
    });
    expect(found).toEqual([{ t: 500, source: "stage" }]);
  });

  test("ignores awake stages outside the session and a night with no sleep", () => {
    expect(
      detectWakeUps({
        ...session,
        stages: stages([-50, 10, "awake"], [10_000, 10_100, "awake"], [200, 400, "core"]),
      }),
    ).toEqual([]);
    expect(detectWakeUps({ ...session, stages: stages([0, 100, "awake"]) })).toEqual([]);
  });

  test("flags a sudden heart-rate jump during sleep", () => {
    const jumpAt = 160;
    const found = detectWakeUps({
      ...session,
      stages: stages([0, 1000, "core"]),
      heartRate: [
        [100, 55],
        [jumpAt, 55 + HEART_RATE_JUMP_BPM],
      ],
    });
    expect(found).toEqual([{ t: jumpAt, source: "heartRate" }]);
  });

  test("ignores a smaller rise, a slow rise, and a jump while already awake", () => {
    const asleep = stages([0, 2000, "core"]);
    expect(
      detectWakeUps({
        ...session,
        stages: asleep,
        heartRate: [
          [100, 60],
          [160, 60 + HEART_RATE_JUMP_BPM - 0.1],
        ],
      }),
    ).toEqual([]);
    expect(
      detectWakeUps({
        ...session,
        stages: asleep,
        heartRate: [
          [100, 60],
          [100 + HEART_RATE_JUMP_MAX_GAP_SECONDS + 1, 60 + HEART_RATE_JUMP_BPM],
        ],
      }),
    ).toEqual([]);
    expect(
      detectWakeUps({
        ...session,
        stages: stages([0, 500, "core"], [500, 800, "awake"], [800, 1200, "rem"]),
        heartRate: [
          [520, 60],
          [560, 60 + HEART_RATE_JUMP_BPM],
        ],
      }),
    ).toEqual([{ t: 500, source: "stage" }]);
  });

  test("counts one wake-up for a run of rises, and jumps with no stages", () => {
    const found = detectWakeUps({
      ...session,
      stages: stages([0, 1000, "deep"]),
      heartRate: [
        [10, 50],
        [20, 70],
        [30, 90],
        [40, 88],
        [50, 110],
      ],
    });
    expect(found).toEqual([
      { t: 20, source: "heartRate" },
      { t: 50, source: "heartRate" },
    ]);

    expect(
      detectWakeUps({
        sessionStart: 0,
        sessionEnd: 200,
        heartRate: [
          [10, 50],
          [40, 70],
        ],
      }),
    ).toEqual([{ t: 40, source: "heartRate" }]);
  });

  test("returns nothing when the session is empty", () => {
    expect(detectWakeUps({ sessionStart: 0, sessionEnd: 0 })).toEqual([]);
    expect(detectWakeUps({ ...session })).toEqual([]);
  });
});

const seededNight = {
  nightStart: 0,
  nightEnd: 3600,
  spikes: [{ t: 100 }, { t: 1800 }],
  seed: 7,
};

describe("linkWakeUps", () => {
  test("zero wake-ups still reports the night's baseline rate", () => {
    const linked = linkWakeUps({ ...seededNight, wakeUps: [] });
    expect(linked.wakeUps).toBe(0);
    expect(linked.followedSpike).toBe(0);
    expect(linked.baselineRate).toBeGreaterThan(0);
    expect(linked.baselineRate).toBeLessThanOrEqual(1);
    expect(linkWakeUps({ ...seededNight, wakeUps: [] })).toEqual(linked);
  });

  test("no spikes links nothing and has a zero baseline", () => {
    expect(
      linkWakeUps({
        ...seededNight,
        spikes: [],
        wakeUps: [{ t: 500 }, { t: 800 }],
      }),
    ).toEqual({ wakeUps: 2, followedSpike: 0, baselineRate: 0 });
  });

  test("known seeded baseline, including a spike 60 and 120 seconds before", () => {
    const { min, max } = ATTRIBUTION_WINDOW_SECONDS;
    const wake = 1000;
    const linked = linkWakeUps({
      ...seededNight,
      spikes: [{ t: wake - min }, { t: wake - max }, { t: 1800 }],
      wakeUps: [{ t: wake }, { t: 400 }],
    });
    // t=1000 is exactly `min` after one spike and `max` after the other. t=400 is not.
    expect(linked.wakeUps).toBe(2);
    expect(linked.followedSpike).toBe(1);
    // Locked for mulberry32 seed 7, night [0, 3600), spikes at 940, 880 and 1800,
    // 1000 windows of 60 seconds. 46 of those windows held a spike.
    expect(linked.baselineRate).toBe(46 / RANDOM_WINDOW_COUNT);
    expect(
      linkWakeUps({
        ...seededNight,
        spikes: [{ t: 1800 }, { t: wake - max }, { t: wake - min }],
        wakeUps: [{ t: 400 }, { t: wake }],
      }),
    ).toEqual(linked);
  });

  test("counts a spike from 60 to 120 seconds before, and not 59 or 121", () => {
    const { min, max } = ATTRIBUTION_WINDOW_SECONDS;
    const wake = 1000;
    const linked = (delta: number) =>
      linkWakeUps({
        nightStart: 0,
        nightEnd: 30,
        seed: 1,
        spikes: [{ t: wake - delta }],
        wakeUps: [{ t: wake }],
      });
    expect(linked(min)).toEqual({ wakeUps: 1, followedSpike: 1, baselineRate: 0 });
    expect(linked(max)).toEqual({ wakeUps: 1, followedSpike: 1, baselineRate: 0 });
    expect(linked(min - 1)).toEqual({ wakeUps: 1, followedSpike: 0, baselineRate: 0 });
    expect(linked(max + 1)).toEqual({ wakeUps: 1, followedSpike: 0, baselineRate: 0 });
  });
});

describe("pooledAttribution", () => {
  const night = { wakeUps: 2, followedSpike: 1 };

  test("stays on counts below the pooled-night constant", () => {
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE - 1 }, () => night);
    expect(pooledAttribution(nights)).toEqual({
      display: "counts",
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE - 1,
      wakeUps: 2 * (MIN_NIGHTS_FOR_PERCENTAGE - 1),
      followedSpike: MIN_NIGHTS_FOR_PERCENTAGE - 1,
    });
  });

  test("shows a percentage once enough nights are pooled", () => {
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE }, () => night);
    expect(pooledAttribution(nights)).toEqual({
      display: "percentage",
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE,
      wakeUps: 2 * MIN_NIGHTS_FOR_PERCENTAGE,
      followedSpike: MIN_NIGHTS_FOR_PERCENTAGE,
      percent: 50,
    });
  });

  test("stays on counts when the pool has no wake-ups", () => {
    const quiet = { wakeUps: 0, followedSpike: 0 };
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE }, () => quiet);
    expect(pooledAttribution(nights)).toEqual({
      display: "counts",
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE,
      wakeUps: 0,
      followedSpike: 0,
    });
    expect(pooledAttribution([])).toEqual({
      display: "counts",
      nightsPooled: 0,
      wakeUps: 0,
      followedSpike: 0,
    });
  });
});
