import { describe, expect, test } from "bun:test";
import {
  isOutsideRecommendedHours,
  SPIKE_MIN_BASELINE_SAMPLES,
  SPIKE_THRESHOLD_DB,
} from "@kip/shared/domain";
import type { LiveSample, LiveStreamItem } from "@kip/shared/live";
import { createApp } from "../../app";
import { createCallerFactory } from "../../trpc/init";
import { liveRouter } from "./router";
import { pushLiveSamples, resetLiveSession, streamLive } from "./service";

const USER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
/** Same instant as the shared live fixture, which falls outside recommended hours. */
const PEAK_T = 1_763_100_002;
const QUIET = 31.5;

function caller(userId: string | null = USER) {
  return createCallerFactory(liveRouter)({ userId });
}

function quiet(start: number, count: number, db = QUIET): LiveSample[] {
  return Array.from({ length: count }, (_, i) => ({ t: start + i, db }));
}

async function collect(
  iterable: AsyncIterable<LiveStreamItem>,
  count: number,
): Promise<LiveStreamItem[]> {
  const items: LiveStreamItem[] = [];
  for await (const item of iterable) {
    items.push(item);
    if (items.length === count) break;
  }
  return items;
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("live session", () => {
  test("rejects a push with no user and an empty batch", async () => {
    resetLiveSession();
    const anon = caller(null);
    await expect(anon.push({ samples: [{ t: 1, db: QUIET }] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller().push({ samples: [] })).rejects.toThrow();
  });

  test("fans one batch out to every current viewer", async () => {
    resetLiveSession();
    const firstSample = { t: 1, db: QUIET };
    const secondSample = { t: 2, db: QUIET + 0.4 };
    const viewers = [collect(streamLive(), 2), collect(streamLive(), 2)];
    const result = pushLiveSamples({ samples: [firstSample, secondSample] });
    const [first, second] = await Promise.all(viewers);
    expect(result).toEqual({ samples: 2, events: [] });
    expect(first).toEqual(second);
    expect(first).toEqual([
      { type: "sample", sample: firstSample },
      { type: "sample", sample: secondSample },
    ]);
  });

  test("a viewer who joins later receives the retained window, then new samples", async () => {
    resetLiveSession();
    pushLiveSamples({ samples: [{ t: 1, db: QUIET }] });
    const pending = collect(streamLive(), 2);
    await settled();
    pushLiveSamples({ samples: [{ t: 2, db: QUIET + 1 }] });
    expect(await pending).toEqual([
      { type: "sample", sample: { t: 1, db: QUIET } },
      { type: "sample", sample: { t: 2, db: QUIET + 1 } },
    ]);
  });

  test("an aborted viewer stops receiving while others keep the session", async () => {
    resetLiveSession();
    const controller = new AbortController();
    const seen: LiveStreamItem[] = [];
    const running = (async () => {
      for await (const item of streamLive(controller.signal)) seen.push(item);
    })();
    pushLiveSamples({ samples: [{ t: 1, db: QUIET }] });
    await settled();
    expect(seen).toHaveLength(1);
    controller.abort();
    await running;
    const stillWatching = collect(streamLive(), 2);
    pushLiveSamples({ samples: [{ t: 2, db: QUIET }] });
    expect(seen).toHaveLength(1);
    expect(await stillWatching).toEqual([
      { type: "sample", sample: { t: 1, db: QUIET } },
      { type: "sample", sample: { t: 2, db: QUIET } },
    ]);
  });

  test("holds a loud sample until the next one closes the spike", () => {
    resetLiveSession();
    const start = PEAK_T - SPIKE_MIN_BASELINE_SAMPLES;
    const open = pushLiveSamples({
      samples: [
        ...quiet(start, SPIKE_MIN_BASELINE_SAMPLES),
        { t: PEAK_T, db: QUIET + SPIKE_THRESHOLD_DB },
      ],
    });
    expect(open.events).toEqual([]);
    expect(open.samples).toBe(SPIKE_MIN_BASELINE_SAMPLES + 1);

    const closed = pushLiveSamples({ samples: [{ t: PEAK_T + 1, db: QUIET }] });
    expect(closed.events).toEqual([
      {
        spike: { t: PEAK_T, peakDb: QUIET + SPIKE_THRESHOLD_DB, baselineDb: QUIET },
        label: "uncertain",
        outsideRecommendedHours: true,
        briefingAudioUrl: null,
      },
    ]);
    expect(isOutsideRecommendedHours(new Date(PEAK_T * 1000))).toBe(true);
  });

  test("a level under the threshold never becomes an event", () => {
    resetLiveSession();
    const start = 1_000;
    const result = pushLiveSamples({
      samples: [
        ...quiet(start, SPIKE_MIN_BASELINE_SAMPLES),
        { t: start + SPIKE_MIN_BASELINE_SAMPLES, db: QUIET + SPIKE_THRESHOLD_DB - 0.1 },
        { t: start + SPIKE_MIN_BASELINE_SAMPLES + 1, db: QUIET },
      ],
    });
    expect(result.events).toEqual([]);
  });

  test("two excursions in one batch become two events", () => {
    resetLiveSession();
    const start = 5_000;
    const first = start + SPIKE_MIN_BASELINE_SAMPLES;
    const result = pushLiveSamples({
      samples: [
        ...quiet(start, SPIKE_MIN_BASELINE_SAMPLES),
        { t: first, db: 50 },
        { t: first + 1, db: QUIET },
        { t: first + 10, db: 48 },
        { t: first + 11, db: QUIET },
      ],
    });
    expect(result.events.map((event) => event.spike)).toEqual([
      { t: first, peakDb: 50, baselineDb: QUIET },
      { t: first + 10, peakDb: 48, baselineDb: QUIET },
    ]);
  });

  test("the router subscription yields a pushed sample to two callers", async () => {
    resetLiveSession();
    const phone = caller();
    const viewers = [collect(await phone.stream(), 1), collect(await phone.stream(), 1)];
    await phone.push({ samples: [{ t: 8, db: 33 }] });
    const [first, second] = await Promise.all(viewers);
    expect(first).toEqual(second);
    expect(first).toEqual([{ type: "sample", sample: { t: 8, db: 33 } }]);
  });
});

describe("live over HTTP", () => {
  test("POST live.push shows up on the SSE subscription for two viewers", async () => {
    resetLiveSession();
    const server = Bun.serve({ port: 0, fetch: createApp().fetch });
    const left = openSse(await fetch(new URL("/trpc/live.stream", server.url)));
    const right = openSse(await fetch(new URL("/trpc/live.stream", server.url)));
    try {
      expect(left.response.status).toBe(200);
      expect(left.response.headers.get("content-type")).toContain("text/event-stream");
      await left.until((text) => text.includes("event: connected"));
      await right.until((text) => text.includes("event: connected"));

      const denied = await fetch(new URL("/trpc/live.push", server.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { samples: [{ t: 4, db: 30 }] } }),
      });
      expect(denied.status).toBe(401);

      const pushed = await fetch(new URL("/trpc/live.push", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-kip-user": USER },
        body: JSON.stringify({
          json: {
            samples: [
              { t: 4, db: 30 },
              { t: 5, db: 30.5 },
            ],
          },
        }),
      });
      expect(pushed.status).toBe(200);
      const body = (await pushed.json()) as { result: { data: { json: { samples: number } } } };
      expect(body.result.data.json.samples).toBe(2);

      const sample = '"t":4';
      const leftText = await left.until((text) => text.includes(sample) && text.includes('"t":5'));
      const rightText = await right.until(
        (text) => text.includes(sample) && text.includes('"t":5'),
      );
      expect(leftText).toContain('"type":"sample"');
      expect(rightText).toContain('"type":"sample"');
    } finally {
      await left.stop();
      await right.stop();
      await server.stop(true);
    }
  });
});

function openSse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SSE response has no body");
  const decoder = new TextDecoder();
  let text = "";
  let closed = false;
  const waiters: Array<() => void> = [];
  const wake = () => {
    for (const resolve of waiters.splice(0)) resolve();
  };
  const pumping = (async () => {
    while (!closed) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      wake();
    }
    closed = true;
    wake();
  })();
  return {
    response,
    async until(ready: (value: string) => boolean) {
      const started = Date.now();
      while (!ready(text)) {
        if (closed) throw new Error(`SSE closed before the sample arrived:\n${text}`);
        if (Date.now() - started > 2000) throw new Error(`SSE timed out:\n${text}`);
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
      return text;
    },
    async stop() {
      closed = true;
      await reader.cancel();
      wake();
      await pumping.catch(() => undefined);
    },
  };
}
