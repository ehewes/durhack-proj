import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { MAX_CLIP_BYTES } from "@kip/shared/labels";
import { applyEventLabel, type EventLabelPatch, type NightEvent } from "@kip/shared/night";
import { Hono } from "hono";
import { createCallerFactory, router } from "../../trpc/init";
import { NightNotFoundError, type NightRecord } from "../night";
import { createLabelsHttp } from "./http";
import { createLabelsRouter } from "./router";
import { labelForTag, scribeLabel } from "./scribe";
import { createLabelsService, type LabelsDeps } from "./service";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NIGHT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPIKE_T = 1_794_613_920;

function unlabelled(id: string, t: number): NightEvent {
  return {
    id,
    t,
    peakDb: 70,
    label: null,
    labelSources: { gemini: null, scribe: null },
    outsideRecommendedHours: null,
  };
}

/** Only the fields this feature reads. */
function record(): NightRecord {
  return {
    nightId: NIGHT,
    userId: USER,
    events: [unlabelled("clip-1", SPIKE_T), unlabelled("clip-2", SPIKE_T + 3600)],
  } as unknown as NightRecord;
}

function wav(length = 640): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
}

function setup(
  classify: LabelsDeps["classifyClip"] = async () => ({ label: "construction" }),
  tag: LabelsDeps["tagAudio"] = async () => [],
) {
  let night = record();
  const patches: EventLabelPatch[][] = [];
  const classifyClip = mock(classify);
  const deps: LabelsDeps = {
    async getNight(nightId) {
      return nightId === NIGHT ? night : null;
    },
    async addEventLabels(_userId, _nightId, batch) {
      patches.push([...batch]);
      night = {
        ...night,
        events: night.events.map((event) => {
          const patch = batch.find((p) => p.id === event.id);
          return patch ? applyEventLabel(event, patch) : event;
        }),
      };
      return night;
    },
    classifyClip,
    tagAudio: mock(tag),
  };
  return { service: createLabelsService(deps), patches, classifyClip };
}

function app(service: ReturnType<typeof createLabelsService>) {
  const hono = new Hono();
  createLabelsHttp(service)(hono);
  return hono;
}

function upload(
  hono: Hono,
  options: { body?: Uint8Array; type?: string; t?: number; user?: string | null; night?: string },
) {
  const headers: Record<string, string> = { "content-type": options.type ?? "audio/wav" };
  if (options.user !== null) headers["x-kip-user"] = options.user ?? USER;
  const url = `/upload/clip?nightId=${options.night ?? NIGHT}&t=${options.t ?? SPIKE_T}`;
  return hono.request(url, { method: "POST", headers, body: options.body ?? wav() });
}

afterEach(() => mock.restore());

describe("POST /upload/clip", () => {
  test("labels the spike with Gemini and stores the label on the night", async () => {
    const { service, patches, classifyClip } = setup();
    const res = await upload(app(service), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: "clip-1", label: "construction" });
    expect(patches).toEqual([[{ id: "clip-1", gemini: "construction" }]]);
    expect(classifyClip.mock.calls[0]?.[1]).toBe("audio/wav");
  });

  test("matches a spike time a second off the stored one", async () => {
    const { service, patches } = setup();
    const res = await upload(app(service), { t: SPIKE_T + 3600.8 });
    expect(res.status).toBe(200);
    expect(patches[0]?.[0]?.id).toBe("clip-2");
  });

  test("persists the label only, never the audio", async () => {
    const writeFile = spyOn(fsPromises, "writeFile");
    const bunWrite = spyOn(Bun, "write");
    const { service, patches } = setup();
    const body = wav(2048);
    body.fill(7, 12);
    const res = await upload(app(service), { body });
    expect(res.status).toBe(200);
    expect(writeFile).not.toHaveBeenCalled();
    expect(bunWrite).not.toHaveBeenCalled();
    // The only write is one patch with a label; nothing in it carries bytes.
    expect(patches).toHaveLength(1);
    expect(Object.keys(patches[0]?.[0] ?? {}).sort()).toEqual(["gemini", "id"]);
    expect(JSON.stringify(patches)).not.toContain("RIFF");
  });

  test("rejects a clip over the size limit without calling Gemini", async () => {
    const { service, classifyClip, patches } = setup();
    const res = await upload(app(service), { body: wav(MAX_CLIP_BYTES + 1) });
    expect(res.status).toBe(413);
    expect(classifyClip).not.toHaveBeenCalled();
    expect(patches).toHaveLength(0);
  });

  test("rejects an empty clip", async () => {
    const { service, classifyClip } = setup();
    const res = await upload(app(service), { body: new Uint8Array(0) });
    expect(res.status).toBe(413);
    expect(classifyClip).not.toHaveBeenCalled();
  });

  test("rejects other types and non-WAV bytes", async () => {
    const { service, classifyClip } = setup();
    expect((await upload(app(service), { type: "audio/mpeg" })).status).toBe(415);
    expect((await upload(app(service), { body: new Uint8Array(64).fill(1) })).status).toBe(400);
    expect(classifyClip).not.toHaveBeenCalled();
  });

  test("needs a user and valid query", async () => {
    const { service } = setup();
    expect((await upload(app(service), { user: null })).status).toBe(401);
    expect((await upload(app(service), { night: "nope" })).status).toBe(400);
  });

  test("hides another user's night and unknown spikes", async () => {
    const { service, classifyClip } = setup();
    expect((await upload(app(service), { user: OTHER })).status).toBe(404);
    expect((await upload(app(service), { t: SPIKE_T + 100 })).status).toBe(404);
    expect(classifyClip).not.toHaveBeenCalled();
  });

  test("answers 502 when Gemini fails and stores nothing", async () => {
    const { service, patches } = setup(async () => {
      throw new Error("gemini down");
    });
    const res = await upload(app(service), {});
    expect(res.status).toBe(502);
    expect(patches).toHaveLength(0);
  });

  test("a handling label from the classifier is stored as handling", async () => {
    const { service } = setup(async () => ({ label: "handling" }));
    const res = await upload(app(service), {});
    expect(await res.json()).toEqual({ eventId: "clip-1", label: "handling" });
  });
});

describe("Scribe second label", () => {
  const tags = (...text: string[]) => text.map((t) => ({ text: t }));

  test("agreement keeps both labels and the shared label", async () => {
    const { service, patches } = setup(
      async () => ({ label: "construction" }),
      async () => tags("(drilling)"),
    );
    const res = await upload(app(service), {});
    expect(await res.json()).toEqual({ eventId: "clip-1", label: "construction" });
    expect(patches[0]).toEqual([{ id: "clip-1", gemini: "construction", scribe: "construction" }]);
  });

  test("disagreement stores uncertain and keeps both labels", async () => {
    const { service } = setup(
      async () => ({ label: "construction" }),
      async () => tags("(snoring)"),
    );
    const res = await upload(app(service), {});
    expect(await res.json()).toEqual({ eventId: "clip-1", label: "uncertain" });
    const night = await service.forNight(USER, NIGHT);
    expect(night.events[0]?.label).toBe("uncertain");
  });

  test("a failing Scribe leaves Gemini's label alone", async () => {
    const { service, patches } = setup(undefined, async () => {
      throw new Error("scribe down");
    });
    const res = await upload(app(service), {});
    expect(await res.json()).toEqual({ eventId: "clip-1", label: "construction" });
    expect(patches[0]).toEqual([{ id: "clip-1", gemini: "construction" }]);
  });

  test("tags Kip cannot name do not vote", async () => {
    const { service, patches } = setup(undefined, async () => tags("(laughter)", "(music)"));
    await upload(app(service), {});
    expect(patches[0]).toEqual([{ id: "clip-1", gemini: "construction" }]);
  });

  test("maps tags to the label set", () => {
    expect(labelForTag("(Jackhammer)")).toBe("construction");
    expect(labelForTag("(car horn)")).toBe("traffic");
    expect(labelForTag("(siren)")).toBe("siren");
    expect(labelForTag("(snores)")).toBe("snoring");
    expect(labelForTag("(rustling)")).toBe("handling");
    expect(labelForTag("(laughter)")).toBeNull();
    expect(scribeLabel(tags("(car)", "(drilling)", "(drilling)"))).toBe("construction");
    expect(scribeLabel([])).toBeNull();
  });
});

describe("labels.forNight", () => {
  const caller = (userId: string | null) => {
    const { service } = setup();
    return createCallerFactory(router({ labels: createLabelsRouter(service) }))({ userId }).labels;
  };

  test("lists events with their labels", async () => {
    const out = await caller(USER).forNight({ nightId: NIGHT });
    expect(out.events.map((e) => [e.id, e.label])).toEqual([
      ["clip-1", null],
      ["clip-2", null],
    ]);
  });

  test("reports another user's night as missing", async () => {
    await expect(caller(OTHER).forNight({ nightId: NIGHT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("service throws NightNotFoundError for unknown nights", async () => {
    const { service } = setup();
    await expect(
      service.forNight(USER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    ).rejects.toBeInstanceOf(NightNotFoundError);
  });
});
