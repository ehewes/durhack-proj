import { describe, expect, test } from "bun:test";
import { isOutsideRecommendedHours } from "../domain";
import streamFixture from "./fixtures/live-stream.json";
import { liveEvent, livePushInput, liveSample, liveStreamItem } from "./index";

describe("live fixtures", () => {
  const items = streamFixture.map((item) => liveStreamItem.parse(item));
  const samples = items.flatMap((i) => (i.type === "sample" ? [i.sample] : []));
  const event = items.flatMap((i) => (i.type === "event" ? [i.event] : []))[0];

  test("every stream item parses", () => {
    expect(items).toHaveLength(streamFixture.length);
  });

  test("samples form a valid push batch", () => {
    expect(livePushInput.parse({ samples }).samples).toHaveLength(4);
    expect(() => livePushInput.parse({ samples: [] })).toThrow();
  });

  test("the event's spike is one of the samples", () => {
    expect(samples.some((s) => s.t === event?.spike.t && s.db === event.spike.peakDb)).toBe(true);
  });

  test("the construction event is outside the recommended hours", () => {
    expect(event?.label).toBe("construction");
    expect(isOutsideRecommendedHours(new Date((event?.spike.t ?? 0) * 1000))).toBe(true);
    expect(event?.outsideRecommendedHours).toBe(true);
  });

  test("bad payloads are rejected", () => {
    expect(() => liveSample.parse({ t: 1, db: "loud" })).toThrow();
    expect(() => liveEvent.parse({ ...event, label: "banging" })).toThrow();
  });
});
