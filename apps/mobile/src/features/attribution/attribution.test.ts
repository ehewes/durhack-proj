import { describe, expect, test } from "bun:test";
import { toAttributionView } from "@kip/shared/attribution";
import {
  bannedWording,
  detectWakeUps,
  linkWakeUps,
  NEVER_CAUSED_BY,
  RANDOM_WINDOW_COUNT,
  SAY_SIMULATED,
} from "@kip/shared/domain";
import { nightTimeline, nightUpload } from "@kip/shared/night";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import nightUploadFixture from "../../../../../packages/shared/src/night/fixtures/night-upload.json";
import {
  attributionSummaryText,
  clock,
  LOAD_ERROR,
  LOADING,
  METHOD,
  NO_WAKE_UPS,
  SIMULATED_NIGHT,
  spikeLine,
  TITLE,
  TRACK_CAPTION,
  TRY_AGAIN,
  trackLabel,
  wakeLine,
} from "./copy";
import { demoAttribution, demoEvents, demoWindow } from "./data/demo";
import { epochSeconds, fractionAlong, marksFromAttribution } from "./marks";

/** Same FNV-1a mix as the server's `attributionSeed`, so the baseline matches forNight. */
function attributionSeed(nightId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < nightId.length; i++) {
    hash ^= nightId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

const timeline = nightTimeline.parse(nightTimelineFixture);
const upload = nightUpload.parse(nightUploadFixture);

/** One wake-up 90 seconds after the siren, so the linked lines render too. */
const linkedNight = {
  wakeUps: [
    { t: 1794619110, source: "stage" as const, linkedEventId: "clip-2" },
    { t: 1794628800, source: "heartRate" as const, linkedEventId: null },
  ],
};

/** Every line the screen, the summary and the marks render, for the demo night and a linked one. */
function renderedLines(): string[] {
  const lines = [
    TITLE,
    METHOD,
    TRACK_CAPTION,
    NO_WAKE_UPS,
    LOADING,
    LOAD_ERROR,
    TRY_AGAIN,
    SIMULATED_NIGHT,
    attributionSummaryText(demoAttribution),
    attributionSummaryText({
      night: toAttributionView([{ wakeUps: 4, followedSpike: 3 }]),
      randomWindowRate: 0.1,
    }),
    attributionSummaryText({
      night: toAttributionView([{ wakeUps: 1, followedSpike: 1 }]),
      randomWindowRate: 0,
    }),
    clock(epochSeconds(demoWindow.startedAt)),
    clock(epochSeconds(demoWindow.endedAt)),
  ];
  for (const result of [demoAttribution, linkedNight]) {
    const marks = marksFromAttribution(result, demoEvents);
    const followed = marks.wakeUps.filter((wake) => wake.linkedEventId !== null).length;
    lines.push(
      trackLabel(marks.wakeUps.length, followed),
      ...marks.wakeUps.map((wake) => wakeLine(wake)),
      ...marks.spikes.map((spike) => spikeLine(spike.t)),
    );
  }
  return lines;
}

describe("attribution summary", () => {
  test('reads "3 of 4 wake-ups followed a spike; random moments: 1 of 10"', () => {
    const night = toAttributionView([{ wakeUps: 4, followedSpike: 3 }]);
    expect(night.text).toBe("3 of 4 wake-ups followed a spike");
    const text = attributionSummaryText({ night, randomWindowRate: 0.1 });
    expect(text).toBe("3 of 4 wake-ups followed a spike; random moments: 1 of 10");
    expect(text).not.toContain(NEVER_CAUSED_BY);
  });

  test("a single wake-up stays singular, and a zero rate is 0 of every window drawn", () => {
    expect(
      attributionSummaryText({
        night: toAttributionView([{ wakeUps: 1, followedSpike: 1 }]),
        randomWindowRate: 0,
      }),
    ).toBe(`1 of 1 wake-up followed a spike; random moments: 0 of ${RANDOM_WINDOW_COUNT}`);
  });

  test("the random-window rate reduces, and a rate above 1 clamps", () => {
    const night = toAttributionView([{ wakeUps: 2, followedSpike: 0 }]);
    expect(attributionSummaryText({ night, randomWindowRate: 0.14 })).toBe(
      "0 of 2 wake-ups followed a spike; random moments: 7 of 50",
    );
    expect(attributionSummaryText({ night, randomWindowRate: 0.15 })).toBe(
      "0 of 2 wake-ups followed a spike; random moments: 3 of 20",
    );
    expect(attributionSummaryText({ night, randomWindowRate: 1.4 })).toBe(
      "0 of 2 wake-ups followed a spike; random moments: 1 of 1",
    );
    expect(attributionSummaryText({ night, randomWindowRate: Number.NaN })).toBe(
      `0 of 2 wake-ups followed a spike; random moments: 0 of ${RANDOM_WINDOW_COUNT}`,
    );
  });

  test("no rendered line uses a Never-say phrase from docs/DOMAIN.md", () => {
    const lines = renderedLines();
    expect(lines).toContain("01:18 Wake-up, followed a spike");
    expect(lines).toContain("Spike at 01:17");
    for (const line of lines) {
      expect(bannedWording(line)).toEqual([]);
    }
  });

  test("the captured demo night is labelled simulated", () => {
    expect(SIMULATED_NIGHT.toLowerCase()).toContain(SAY_SIMULATED);
  });
});

describe("marks from forNight", () => {
  test("the shared upload is 0 of 2, and co-timed spikes are not links", () => {
    const sleep = upload.sleep;
    if (!sleep) throw new Error("night upload has no sleep");
    const start = Date.parse(upload.startedAt) / 1000;
    const end = Date.parse(upload.endedAt) / 1000;
    const detected = detectWakeUps({
      sessionStart: start,
      sessionEnd: end,
      stages: sleep.stages.map((stage) => ({
        start: Date.parse(stage.start) / 1000,
        end: Date.parse(stage.end) / 1000,
        stage: stage.stage,
      })),
      heartRate: sleep.heartRate,
    });
    const linked = linkWakeUps({
      spikes: timeline.events.filter((event) => event.label !== "handling"),
      wakeUps: detected,
      nightStart: start,
      nightEnd: end,
      seed: attributionSeed(upload.nightId),
    });

    expect(demoAttribution.wakeUps.map((wake) => ({ t: wake.t, source: wake.source }))).toEqual(
      detected.map((wake) => ({ t: wake.t, source: wake.source })),
    );
    expect(demoAttribution.followedSpike).toBe(linked.followedSpike);
    expect(demoAttribution.followedSpike).toBe(0);
    expect(demoAttribution.randomWindowRate).toBe(linked.baselineRate);
    expect(attributionSummaryText(demoAttribution)).toBe(
      "0 of 2 wake-ups followed a spike; random moments: 11 of 1000",
    );

    const marks = marksFromAttribution(demoAttribution, timeline.events);
    expect(marks.wakeUps).toHaveLength(2);
    expect(marks.spikes).toHaveLength(0);
    expect(marks.wakeUps.every((wake) => wake.linkedEventId === null)).toBe(true);
    expect(marks.wakeUps.map((wake) => wakeLine(wake))).toEqual(["01:17 Wake-up", "06:41 Wake-up"]);
  });

  test("the timeline fixture hand-places links that forNight does not", () => {
    const placed = timeline.wakeUps.filter((wake) => wake.linkedEventId !== null);
    expect(timeline.wakeUps).toHaveLength(3);
    expect(placed).toHaveLength(2);
    const marks = marksFromAttribution(demoAttribution, timeline.events);
    expect(marks.wakeUps).toHaveLength(2);
    expect(marks.spikes).toHaveLength(0);
  });

  test("a linked spike is marked only through linkedEventId", () => {
    const night = toAttributionView([{ wakeUps: 4, followedSpike: 3 }]);
    const start = Date.parse("2026-11-13T23:00:00Z") / 1000;
    const result = {
      wakeUps: [
        { t: start + 16 * 60, source: "stage" as const, linkedEventId: "a" },
        { t: start + 33 * 60, source: "heartRate" as const, linkedEventId: "b" },
        { t: start + 50 * 60, source: "stage" as const, linkedEventId: "c" },
        { t: start + 66 * 60, source: "stage" as const, linkedEventId: null },
      ],
    };
    const events = [
      { id: "a", t: start + 15 * 60 },
      { id: "b", t: start + 32 * 60 },
      { id: "c", t: start + 49 * 60 },
      { id: "same-time", t: start + 66 * 60 },
    ];
    const marks = marksFromAttribution(result, events);
    expect(marks.spikes.map((spike) => spike.id)).toEqual(["a", "b", "c"]);
    expect(marks.wakeUps.map((wake) => wakeLine(wake))).toEqual([
      "23:16 Wake-up, followed a spike",
      "23:33 Wake-up, followed a spike",
      "23:50 Wake-up, followed a spike",
      "00:06 Wake-up",
    ]);
    expect(spikeLine(start + 15 * 60)).toBe("Spike at 23:15");
    expect(attributionSummaryText({ night, randomWindowRate: 0.1 })).toBe(
      "3 of 4 wake-ups followed a spike; random moments: 1 of 10",
    );
  });

  test("the track reads as one image, singular for one wake-up", () => {
    expect(trackLabel(4, 3)).toBe("4 wake-ups, 3 followed a spike");
    expect(trackLabel(1, 0)).toBe("1 wake-up, 0 followed a spike");
  });

  test("fractionAlong clamps to the night", () => {
    expect(fractionAlong(50, 0, 100)).toBe(0.5);
    expect(fractionAlong(-10, 0, 100)).toBe(0);
    expect(fractionAlong(140, 0, 100)).toBe(1);
    expect(fractionAlong(10, 5, 5)).toBe(0);
  });
});
