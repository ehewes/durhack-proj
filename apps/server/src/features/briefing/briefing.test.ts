import { describe, expect, mock, test } from "bun:test";
import { attributionForNightOutput } from "@kip/shared/attribution";
import {
  acceptBriefingText,
  briefingAudioPath,
  briefingViolations,
  briefingWordCount,
  MAX_BRIEFING_WORDS,
} from "@kip/shared/briefing";
import { OUTSIDE_HOURS_WORDING } from "@kip/shared/domain";
import { type NightEvent, nightTimeline, nightUpload } from "@kip/shared/night";
import { Hono } from "hono";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import nightUploadFixture from "../../../../../packages/shared/src/night/fixtures/night-upload.json";
import { createCallerFactory, router } from "../../trpc/init";
import { NightConsentError, type NightRecord, NightStorageError } from "../night";
import { createBriefingCache } from "./cache";
import { briefingPrompt, fallbackBriefing } from "./compose";
import { briefingClock, briefingFacts } from "./facts";
import { createBriefingHttp } from "./http";
import { loadFeatureModule } from "./load";
import { createBriefingRouter } from "./router";
import {
  BriefingAudioError,
  type BriefingDeps,
  BriefingNotFoundError,
  createBriefingService,
} from "./service";

const upload = nightUpload.parse(nightUploadFixture);
const timeline = nightTimeline.parse(nightTimelineFixture);
const USER = upload.userId;
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXAMPLE = "Two wake-ups followed drilling at 06:41, before the 8am limit";
const MP3 = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);
const HANDLING_ID = "clip-handling";
const FALLBACK =
  "Two wake-ups followed a siren at 01:17 and drilling at 06:41. Drilling at 06:41 was outside the council's recommended hours.";

function handlingEvent(): NightEvent {
  return {
    id: HANDLING_ID,
    t: 1794620000,
    peakDb: 91,
    label: "handling",
    labelSources: { gemini: "handling", scribe: null },
    outsideRecommendedHours: null,
  };
}

function fixtureRecord(): NightRecord {
  return {
    ...timeline,
    events: [...timeline.events, handlingEvent()],
    userId: USER,
    consent: upload.consent,
    location: upload.location ?? null,
    vitals: null,
  };
}

function attributionOf(record: NightRecord) {
  const followedSpike = timeline.attribution?.followedSpike ?? 0;
  const counts = {
    display: "counts" as const,
    nightsPooled: 1,
    wakeUps: timeline.wakeUps.length,
    followedSpike,
    text: `${followedSpike} of ${timeline.wakeUps.length} wake-ups followed a spike`,
  };
  return attributionForNightOutput.parse({
    nightId: record.nightId,
    wakeUps: timeline.wakeUps,
    followedSpike,
    randomWindowRate: timeline.attribution?.randomWindowRate ?? 0,
    night: counts,
    pooled: counts,
  });
}

function setup(
  record: NightRecord | null,
  options?: {
    texts?: string[];
    speakError?: boolean;
    emptyAudio?: boolean;
    consentError?: boolean;
  },
) {
  const texts = options?.texts ?? [EXAMPLE];
  let draft = 0;
  const write = mock(async (prompt: string) => {
    const text = texts[Math.min(draft, texts.length - 1)] ?? "";
    draft += 1;
    if (text === "THROW") throw new Error("gemini unavailable");
    return { text, prompt };
  });
  const speak = mock(async (_text: string) => {
    if (options?.speakError) throw new Error("elevenlabs unavailable");
    if (options?.emptyAudio) return new Uint8Array();
    return MP3;
  });
  const forNight = mock(async () => {
    if (!record) throw new NightConsentError();
    if (options?.consentError) throw new NightConsentError();
    return attributionOf(record);
  });
  const cache = createBriefingCache();
  const deps: BriefingDeps = {
    getNight: async (nightId) => (record && record.nightId === nightId ? record : null),
    forNight,
    write: async (prompt) => {
      const result = await write(prompt);
      return { text: result.text };
    },
    speak,
  };
  const svc = createBriefingService(deps, cache);
  return { svc, write, speak, forNight, cache };
}

function promptsOf(write: ReturnType<typeof mock>): string[] {
  return write.mock.calls.map((call) => String(call[0]));
}

test("the voice clients load only when a briefing is asked for", async () => {
  const live = await loadFeatureModule<{ getBriefing: unknown }>("./live");
  expect(typeof live.getBriefing).toBe("function");
});

describe("briefing facts", () => {
  test("the fixture drilling is 06:41 and handling is left out", () => {
    const record = fixtureRecord();
    expect(briefingClock(1794638460)).toBe("06:41");
    const facts = briefingFacts(record, attributionOf(record));
    expect(JSON.stringify(facts)).not.toContain("handling");
    expect(JSON.stringify(facts)).not.toContain(HANDLING_ID);
    expect(JSON.stringify(facts)).not.toContain("91");
    expect(facts.wakeUps).toBe(3);
    expect(facts.wakeUpsThatFollowedANoiseEvent).toBe(2);
    expect(facts.events.map((event) => event.sound)).toEqual([
      "traffic",
      "a siren",
      "snoring",
      "drilling",
    ]);
    const drilling = facts.events.find((event) => event.sound === "drilling");
    expect(drilling).toEqual({
      sound: "drilling",
      time: "06:41",
      outsideRecommendedHours: true,
      wakeUpsThatFollowedIt: 1,
    });
  });

  test("a long night still falls back inside 40 words and the wording rules", () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      sound: "drilling",
      time: `0${index}:10`,
      outsideRecommendedHours: true,
      wakeUpsThatFollowedIt: 1,
    }));
    const text = fallbackBriefing({
      wakeUps: 8,
      wakeUpsThatFollowedANoiseEvent: 8,
      events,
    });
    expect(briefingWordCount(text)).toBeLessThanOrEqual(MAX_BRIEFING_WORDS);
    expect(briefingViolations(text)).toEqual([]);
    expect(text).toContain(OUTSIDE_HOURS_WORDING);
    expect(text.toLowerCase()).not.toContain("handling");
  });

  test("without health data, wake-ups are unknown rather than zero", () => {
    const facts = briefingFacts(fixtureRecord(), null);
    expect(facts.wakeUps).toBeNull();
    expect(facts.wakeUpsThatFollowedANoiseEvent).toBeNull();
    expect(facts.events.map((event) => event.wakeUpsThatFollowedIt)).toEqual([
      null,
      null,
      null,
      null,
    ]);

    const prompt = briefingPrompt(facts);
    expect(prompt).toContain("Do not mention wake-ups or sleep.");
    expect(prompt).not.toContain("Two wake-ups");

    const inHours = {
      ...facts,
      events: facts.events.filter((event) => !event.outsideRecommendedHours),
    };
    expect(fallbackBriefing(inHours)).toBe(
      "Kip heard traffic at 23:52, a siren at 01:17 and snoring at 03:05.",
    );
    expect(fallbackBriefing({ ...facts, events: [] })).toBe("No noise was labelled last night.");
    const many = Array.from({ length: 12 }, () => inHours.events).flat();
    const counted = fallbackBriefing({ ...facts, events: many });
    expect(counted).toBe("36 noise events were labelled last night.");
    for (const text of [fallbackBriefing(inHours), counted]) {
      expect(text.toLowerCase()).not.toContain("wake");
    }
  });

  test("the prompt suggests only the cause and hours phrases", () => {
    const record = fixtureRecord();
    const prompt = briefingPrompt(briefingFacts(record, attributionOf(record)));
    expect(prompt).toContain(OUTSIDE_HOURS_WORDING);
    expect(prompt).toContain("Two wake-ups followed drilling at 06:41");
    const prefer = prompt.split("\n").find((line) => line.startsWith("Prefer these phrases"));
    expect(prefer).toBe(
      `Prefer these phrases when they fit: linked to; followed; ${OUTSIDE_HOURS_WORDING}.`,
    );
  });
});

describe("briefing.get", () => {
  test("returns Gemini's text and serves the cached audio once", async () => {
    const record = fixtureRecord();
    const { svc, write, speak, forNight, cache } = setup(record);
    const caller = createCallerFactory(router({ briefing: createBriefingRouter(svc) }))({
      userId: USER,
    });

    const result = await caller.briefing.get({ nightId: record.nightId });
    expect(result.text).toBe(EXAMPLE);
    expect(result.audioUrl).toBe(briefingAudioPath(record.nightId));
    expect(forNight).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(promptsOf(write).join("\n")).not.toContain("handling");
    expect(promptsOf(write).join("\n")).not.toContain(HANDLING_ID);
    expect(acceptBriefingText(result.text)).toBe(EXAMPLE);

    const again = await caller.briefing.get({ nightId: record.nightId });
    expect(again).toEqual(result);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    const app = new Hono();
    createBriefingHttp(cache)(app);
    const audio = await app.request(result.audioUrl, { headers: { "x-kip-user": USER } });
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(MP3);
    const replay = await app.request(result.audioUrl, { headers: { "x-kip-user": USER } });
    expect(new Uint8Array(await replay.arrayBuffer())).toEqual(MP3);

    const preflight = await app.request(result.audioUrl, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-kip-user",
      },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-kip-user",
    );

    const stranger = await app.request(result.audioUrl, { headers: { "x-kip-user": OTHER } });
    expect(stranger.status).toBe(404);
    const anon = await app.request(result.audioUrl);
    expect(anon.status).toBe(401);
    const missing = await app.request("/briefing/not-a-night/audio", {
      headers: { "x-kip-user": USER },
    });
    expect(missing.status).toBe(404);
  });

  test("rejects a draft that uses a never-say phrase or mentions handling", async () => {
    const record = fixtureRecord();
    const { svc, speak } = setup(record, {
      texts: ["The noise was caused by drilling and it was illegal.", "Handling woke you up."],
    });
    const result = await svc.get(USER, record.nightId);
    expect(result.text).toBe(FALLBACK);
    expect(briefingViolations(result.text)).toEqual([]);
    expect(result.text.toLowerCase()).not.toContain("handling");
    expect(result.text).not.toContain("caused by");
    expect(result.text).not.toContain("illegal");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toBe(FALLBACK);
  });

  test("uses a second draft when the first is too long", async () => {
    const record = fixtureRecord();
    const tooLong = Array.from({ length: MAX_BRIEFING_WORDS + 1 }, () => "word").join(" ");
    const { svc, write } = setup(record, { texts: [tooLong, EXAMPLE] });
    const result = await svc.get(USER, record.nightId);
    expect(result.text).toBe(EXAMPLE);
    expect(write).toHaveBeenCalledTimes(2);
  });

  test("a night without health consent is briefed from labels and hours flags", async () => {
    const record = fixtureRecord();
    record.consent = { ...record.consent, health: false };
    const { svc, forNight } = setup(record, { texts: ["THROW"] });
    const result = await svc.get(USER, record.nightId);
    expect(forNight).not.toHaveBeenCalled();
    expect(result.text).toBe(`Drilling at 06:41 was ${OUTSIDE_HOURS_WORDING}.`);
    expect(briefingViolations(result.text)).toEqual([]);
  });

  test("a missing night, another user, a storage failure and a silent voice are errors", async () => {
    const record = fixtureRecord();
    const missing = setup(null);
    await expect(missing.svc.get(USER, record.nightId)).rejects.toBeInstanceOf(
      BriefingNotFoundError,
    );

    const caller = createCallerFactory(
      router({ briefing: createBriefingRouter(setup(record).svc) }),
    )({ userId: null });
    await expect(caller.briefing.get({ nightId: record.nightId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    const other = createCallerFactory(
      router({ briefing: createBriefingRouter(setup(record).svc) }),
    )({ userId: OTHER });
    await expect(other.briefing.get({ nightId: record.nightId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const stored = createBriefingService(
      {
        getNight: async () => {
          throw new NightStorageError("database unavailable");
        },
        forNight: async () => attributionOf(record),
        write: async () => ({ text: EXAMPLE }),
        speak: async () => MP3,
      },
      createBriefingCache(),
    );
    const storedCaller = createCallerFactory(router({ briefing: createBriefingRouter(stored) }))({
      userId: USER,
    });
    await expect(storedCaller.briefing.get({ nightId: record.nightId })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "database unavailable",
    });

    const quiet = setup(record, { speakError: true });
    await expect(quiet.svc.get(USER, record.nightId)).rejects.toBeInstanceOf(BriefingAudioError);
    const app = new Hono();
    createBriefingHttp(quiet.cache)(app);
    const audio = await app.request(briefingAudioPath(record.nightId), {
      headers: { "x-kip-user": USER },
    });
    expect(audio.status).toBe(404);

    const empty = setup(record, { emptyAudio: true });
    await expect(empty.svc.get(USER, record.nightId)).rejects.toBeInstanceOf(BriefingAudioError);
  });

  test("health consent refused by attribution still briefs the noise", async () => {
    const record = fixtureRecord();
    const { svc, forNight } = setup(record, { consentError: true, texts: ["THROW"] });
    const result = await svc.get(USER, record.nightId);
    expect(forNight).toHaveBeenCalledTimes(1);
    expect(result.text).toBe(`Drilling at 06:41 was ${OUTSIDE_HOURS_WORDING}.`);
  });
});
