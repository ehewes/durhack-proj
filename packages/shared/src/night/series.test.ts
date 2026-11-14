import { describe, expect, test } from "bun:test";
import nightTimelineFixture from "./fixtures/night-timeline.json";
import nightUploadFixture from "./fixtures/night-upload.json";
import {
  applyEventLabel,
  downsampleNoise,
  eventsFromSpikes,
  hoursFlag,
  resolveEventLabel,
} from "./series";
import { nightTimeline } from "./timeline";
import { nightUpload } from "./upload";

const upload = nightUpload.parse(nightUploadFixture);
const timeline = nightTimeline.parse(nightTimelineFixture);

describe("downsampleNoise", () => {
  test("matches the timeline fixture: loudest second of each minute", () => {
    const origin = Date.parse(upload.startedAt) / 1000;
    expect(downsampleNoise(upload.noise.samples, origin)).toEqual(timeline.noise);
  });
});

describe("eventsFromSpikes", () => {
  test("uses clip ids and leaves labels empty", () => {
    const events = eventsFromSpikes(upload.spikes);
    expect(events.map((event) => event.id)).toEqual(timeline.events.map((event) => event.id));
    expect(events.every((event) => event.label === null)).toBe(true);
    expect(eventsFromSpikes([{ t: 10, peakDb: 40 }])[0]?.id).toBe("spike-0");
  });
});

describe("event labels", () => {
  const drilling = timeline.events.find((event) => event.label === "construction");
  if (!drilling) throw new Error("fixture has no construction event");

  test("agreement keeps the label; disagreement is uncertain", () => {
    expect(resolveEventLabel({ gemini: "traffic", scribe: "traffic" })).toBe("traffic");
    expect(resolveEventLabel({ gemini: "snoring", scribe: "traffic" })).toBe("uncertain");
    expect(resolveEventLabel({ gemini: "siren", scribe: null })).toBe("siren");
    expect(resolveEventLabel({ gemini: null, scribe: null })).toBeNull();
  });

  test("only construction is flagged against the council's recommended hours", () => {
    expect(hoursFlag("construction", drilling.t)).toBe(true);
    expect(hoursFlag("uncertain", drilling.t)).toBeNull();
    expect(hoursFlag("traffic", drilling.t)).toBeNull();
  });

  test("a single construction source flags 06:41", () => {
    const bare = eventsFromSpikes(upload.spikes).find((event) => event.id === drilling.id);
    if (!bare) throw new Error("missing drilling spike");
    const labelled = applyEventLabel(bare, { id: bare.id, gemini: "construction" });
    expect(labelled.label).toBe("construction");
    expect(labelled.labelSources.scribe).toBeNull();
    expect(labelled.outsideRecommendedHours).toBe(true);
  });
});
