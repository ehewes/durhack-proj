import { describe, expect, test } from "bun:test";
import { SPIKE_MIN_BASELINE_SAMPLES, SPIKE_THRESHOLD_DB } from "@kip/shared/domain";
import type { LiveSample, LiveStreamItem } from "@kip/shared/live";
import { Hono } from "hono";
import { createLiveAudioStore } from "./audio";
import { createLiveHttp } from "./http";
import { createLivePipeline, LIVE_BUDGET_MS, LiveClipError } from "./pipeline";
import { pushLiveSamples, resetLiveSession, streamLive } from "./service";

/** Falls outside recommended hours (a Saturday evening). */
const PEAK_T = 1_763_100_002;
const QUIET = 31.5;
const ORIGIN = "https://kip.test";
const USER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const wav = new Uint8Array(32);
wav.set([0x52, 0x49, 0x46, 0x46], 0);
wav.set([0x57, 0x41, 0x56, 0x45], 8);

function quiet(start: number, count: number): LiveSample[] {
  return Array.from({ length: count }, (_, i) => ({ t: start + i, db: QUIET }));
}

function seedSpike(): void {
  resetLiveSession();
  pushLiveSamples({
    samples: [
      ...quiet(PEAK_T - SPIKE_MIN_BASELINE_SAMPLES, SPIKE_MIN_BASELINE_SAMPLES),
      { t: PEAK_T, db: QUIET + SPIKE_THRESHOLD_DB },
      { t: PEAK_T + 1, db: QUIET },
    ],
  });
}

function pipeline(overrides: Partial<Parameters<typeof createLivePipeline>[0]> = {}) {
  const calls = { classify: 0, speak: [] as string[] };
  const built = createLivePipeline({
    classifyClip: async () => {
      calls.classify += 1;
      return { label: "construction" };
    },
    speak: async (text) => {
      calls.speak.push(text);
      return new Uint8Array([1, 2, 3]);
    },
    audio: createLiveAudioStore(),
    ...overrides,
  });
  return { built, calls };
}

const clip = { t: PEAK_T, mime: "audio/wav", bytes: wav, origin: ORIGIN };

describe("live clip pipeline", () => {
  test("labels the clip, flags the hours and publishes one event with audio", async () => {
    seedSpike();
    const seen: LiveStreamItem[] = [];
    const controller = new AbortController();
    const watching = (async () => {
      for await (const item of streamLive(controller.signal)) seen.push(item);
    })();
    const { built, calls } = pipeline();
    const started = Date.now();
    const event = await built.process(clip);
    expect(Date.now() - started).toBeLessThan(LIVE_BUDGET_MS);
    expect(event.label).toBe("construction");
    expect(event.outsideRecommendedHours).toBe(true);
    expect(event.briefingAudioUrl).toMatch(
      /^https:\/\/kip\.test\/live\/briefing\/\d+\/audio\?token=/,
    );
    expect(event.spike.t).toBe(PEAK_T);
    expect(calls.speak).toHaveLength(1);
    expect(calls.speak[0]).toContain("outside the council's recommended hours");
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await watching;
    const events = seen.filter((item) => item.type === "event");
    expect(events.at(-1)).toEqual({ type: "event", event });
  });

  test("does not flag hours or speak them for a non-construction label", async () => {
    seedSpike();
    const { built, calls } = pipeline({ classifyClip: async () => ({ label: "traffic" }) });
    const event = await built.process(clip);
    expect(event.label).toBe("traffic");
    expect(calls.speak[0]).not.toContain("recommended hours");
  });

  test("a failed briefing still publishes the event, without audio", async () => {
    seedSpike();
    const { built } = pipeline({
      speak: async () => {
        throw new Error("down");
      },
    });
    const event = await built.process(clip);
    expect(event.label).toBe("construction");
    expect(event.briefingAudioUrl).toBeNull();
  });

  test("a briefing that outruns the budget is dropped, not waited for", async () => {
    seedSpike();
    let tick = 0;
    const { built } = pipeline({
      now: () => (tick++ === 0 ? 0 : LIVE_BUDGET_MS),
      speak: () => new Promise(() => {}),
    });
    const event = await built.process(clip);
    expect(event.briefingAudioUrl).toBeNull();
  });

  test("handling clips are not briefed", async () => {
    seedSpike();
    const { built, calls } = pipeline({ classifyClip: async () => ({ label: "handling" }) });
    const event = await built.process(clip);
    expect(event.briefingAudioUrl).toBeNull();
    expect(calls.speak).toHaveLength(0);
  });

  test("rejects bad clips and unknown spikes before calling Gemini", async () => {
    seedSpike();
    const { built, calls } = pipeline();
    const fail = async (input: typeof clip) =>
      built.process(input).then(
        () => null,
        (error: unknown) => (error instanceof LiveClipError ? error.failure : error),
      );
    expect(await fail({ ...clip, mime: "audio/mpeg" })).toBe("type");
    expect(await fail({ ...clip, bytes: new Uint8Array(0) })).toBe("size");
    expect(await fail({ ...clip, bytes: new Uint8Array(32) })).toBe("format");
    expect(await fail({ ...clip, t: PEAK_T + 500 })).toBe("spike");
    expect(calls.classify).toBe(0);
  });

  test("a classifier failure is reported and publishes nothing", async () => {
    seedSpike();
    const { built } = pipeline({
      classifyClip: async () => {
        throw new Error("boom");
      },
    });
    await expect(built.process(clip)).rejects.toMatchObject({ failure: "classifier" });
  });
});

describe("live http", () => {
  function app() {
    seedSpike();
    const audio = createLiveAudioStore();
    const { built } = pipeline({ audio });
    const hono = new Hono();
    createLiveHttp(built, audio)(hono);
    return hono;
  }

  test("uploads a clip, then serves the briefing audio by token", async () => {
    const hono = app();
    const res = await hono.request(`https://kip.test/live/clip?t=${PEAK_T}`, {
      method: "POST",
      headers: { "x-kip-user": USER, "content-type": "audio/wav" },
      body: wav,
    });
    expect(res.status).toBe(200);
    const event = (await res.json()) as { label: string; briefingAudioUrl: string };
    expect(event.label).toBe("construction");
    const audio = await hono.request(event.briefingAudioUrl);
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const wrong = await hono.request(event.briefingAudioUrl.replace(/token=.*/, "token=nope"));
    expect(wrong.status).toBe(404);
  });

  test("refuses a missing user, a missing time and an unknown spike", async () => {
    const hono = app();
    const post = (query: string, headers: Record<string, string>) =>
      hono.request(`/live/clip${query}`, { method: "POST", headers, body: wav });
    const withUser = { "x-kip-user": USER, "content-type": "audio/wav" };
    expect((await post(`?t=${PEAK_T}`, { "content-type": "audio/wav" })).status).toBe(401);
    expect((await post("", withUser)).status).toBe(400);
    expect((await post("?t=5", withUser)).status).toBe(404);
  });
});
