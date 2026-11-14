import { describe, expect, test } from "bun:test";
import { isOutsideRecommendedHours, nightOf } from "../domain";
import nightTimelineFixture from "./fixtures/night-timeline.json";
import nightUploadFixture from "./fixtures/night-upload.json";
import { nightSummary, nightTimeline } from "./timeline";
import { nightUpload } from "./upload";

describe("night fixtures", () => {
  const upload = nightUpload.parse(nightUploadFixture);
  const timeline = nightTimeline.parse(nightTimelineFixture);

  test("the upload is a full 8-hour night at 1 Hz", () => {
    expect(upload.noise.samples).toHaveLength(8 * 60 * 60);
    expect(upload.sleep?.stages.length).toBeGreaterThan(5);
  });

  test("the timeline matches the upload", () => {
    expect(timeline.nightId).toBe(upload.nightId);
    expect(timeline.night).toBe(nightOf(new Date(upload.startedAt)));
    expect(timeline.events.map((e) => e.t)).toEqual(upload.spikes.map((s) => s.t));
  });

  test("the drilling at 06:41 is outside the recommended hours", () => {
    const drilling = timeline.events.find((e) => e.label === "construction");
    expect(drilling).toBeDefined();
    expect(isOutsideRecommendedHours(new Date((drilling?.t ?? 0) * 1000))).toBe(true);
    expect(drilling?.outsideRecommendedHours).toBe(true);
  });

  test("a summary can be built from the timeline", () => {
    const summary = nightSummary.parse({
      nightId: timeline.nightId,
      userId: upload.userId,
      night: timeline.night,
      startedAt: timeline.startedAt,
      endedAt: timeline.endedAt,
      eventCount: timeline.events.length,
      labelCounts: { construction: 1, traffic: 1, siren: 1, snoring: 1 },
      outsideRecommendedHoursCount: 1,
      wakeUpCount: timeline.wakeUps.length,
      attribution: timeline.attribution,
      evidence: timeline.evidence,
    });
    expect(summary.wakeUpCount).toBe(3);
  });
});

test("accepts a live-mode night without sleep data", () => {
  const result = nightUpload.safeParse({
    nightId: "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
    userId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    startedAt: "2026-11-14T23:00:00+00:00",
    endedAt: "2026-11-15T07:00:00+00:00",
    consent: { microphone: true, health: false, location: false },
    noise: { baselineDb: 32, samples: [[1794870000, 33.5]] },
    spikes: [{ t: 1794870000, peakDb: 61 }],
  });
  expect(result.success).toBe(true);
});

test("event label slots accept handling", () => {
  const timeline = nightTimeline.parse(nightTimelineFixture);
  const event = timeline.events[0];
  if (!event) throw new Error("fixture has no events");
  const withHandling = {
    ...timeline,
    events: [{ ...event, label: "handling", labelSources: { gemini: "handling", scribe: null } }],
  };
  expect(nightTimeline.safeParse(withHandling).success).toBe(true);
  expect(nightSummary.shape.labelCounts.safeParse({ handling: 2 }).success).toBe(true);
});
