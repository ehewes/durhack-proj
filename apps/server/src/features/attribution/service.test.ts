import { expect, test } from "bun:test";
import { detectWakeUps, linkWakeUps, MIN_NIGHTS_FOR_PERCENTAGE } from "@kip/shared/domain";
import {
  type AttributionWrite,
  attributionWrite,
  type NightEvent,
  type NightSummary,
  nightSummary,
  nightTimeline,
  nightUpload,
} from "@kip/shared/night";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import nightUploadFixture from "../../../../../packages/shared/src/night/fixtures/night-upload.json";
import { createCallerFactory, router } from "../../trpc/init";
import { NightConsentError, NightNotFoundError, type NightRecord } from "../night";
import { createAttributionRouter } from "./router";
import { type AttributionNights, attributionSeed, createAttributionService } from "./service";

const upload = nightUpload.parse(nightUploadFixture);
const timeline = nightTimeline.parse(nightTimelineFixture);
const USER = upload.userId;
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function event(id: string, t: number, label: NightEvent["label"]): NightEvent {
  return {
    id,
    t,
    peakDb: 60,
    label,
    labelSources: { gemini: label, scribe: label },
    outsideRecommendedHours: null,
  };
}

function fixtureRecord(): NightRecord {
  const sleep = upload.sleep;
  if (!sleep) throw new Error("night fixture has no sleep");
  return {
    ...timeline,
    wakeUps: [],
    attribution: null,
    userId: USER,
    consent: upload.consent,
    location: upload.location ?? null,
    vitals: {
      heartRate: sleep.heartRate.map((sample) => [sample[0], sample[1]]),
      hrv: sleep.hrv.map((sample) => [sample[0], sample[1]]),
      respiratoryRate: sleep.respiratoryRate.map((sample) => [sample[0], sample[1]]),
    },
  };
}

function summaryOf(record: NightRecord): NightSummary {
  const labelCounts: NightSummary["labelCounts"] = {};
  let outsideRecommendedHoursCount = 0;
  for (const item of record.events) {
    if (item.label) labelCounts[item.label] = (labelCounts[item.label] ?? 0) + 1;
    if (item.outsideRecommendedHours) outsideRecommendedHoursCount += 1;
  }
  return nightSummary.parse({
    nightId: record.nightId,
    userId: record.userId,
    night: record.night,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    eventCount: record.events.length,
    labelCounts,
    outsideRecommendedHoursCount,
    wakeUpCount: record.wakeUps.length,
    attribution: record.attribution,
    evidence: record.evidence,
  });
}

/** In-memory stand-in for the night service. No database. */
function memory(records: NightRecord[]) {
  const byId = new Map(records.map((record) => [record.nightId, structuredClone(record)]));
  const writes: { userId: string; nightId: string; value: AttributionWrite }[] = [];
  const nights: AttributionNights = {
    async getNight(nightId) {
      const found = byId.get(nightId);
      return found ? structuredClone(found) : null;
    },
    async setAttribution(userId, nightId, value) {
      const found = byId.get(nightId);
      if (!found || found.userId !== userId) throw new NightNotFoundError(nightId);
      if (!found.consent.health) throw new NightConsentError();
      const parsed = attributionWrite.parse(value);
      found.wakeUps = parsed.wakeUps;
      found.attribution = parsed.attribution;
      writes.push({ userId, nightId, value: structuredClone(parsed) });
      return structuredClone(found);
    },
    async listNights(userId) {
      return [...byId.values()]
        .filter((record) => record.userId === userId)
        .map((record) => summaryOf(record));
    },
  };
  return { nights, writes };
}

function preset(day: number, followedSpike: number): NightRecord {
  const base = fixtureRecord();
  const date = `2026-10-${String(day).padStart(2, "0")}`;
  const next = `2026-10-${String(day + 1).padStart(2, "0")}`;
  return {
    ...base,
    nightId: `00000000-0000-4000-8000-${String(day).padStart(12, "0")}`,
    night: date,
    startedAt: `${date}T23:00:00+00:00`,
    endedAt: `${next}T07:00:00+00:00`,
    events: [],
    stages: [],
    noise: [],
    vitals: null,
    wakeUps: [],
    attribution: { wakeUps: 2, followedSpike, randomWindowRate: 0, nightsPooled: 1 },
  };
}

test("the night fixture is counts: 0 of 2 wake-ups followed a spike", async () => {
  const record = fixtureRecord();
  const { nights, writes } = memory([record]);
  const result = await createAttributionService(nights).forNight(USER, record.nightId);

  const start = Date.parse(record.startedAt) / 1000;
  const end = Date.parse(record.endedAt) / 1000;
  const expected = linkWakeUps({
    spikes: record.events,
    wakeUps: detectWakeUps({
      sessionStart: start,
      sessionEnd: end,
      stages: record.stages.map((stage) => ({
        start: Date.parse(stage.start) / 1000,
        end: Date.parse(stage.end) / 1000,
        stage: stage.stage,
      })),
      heartRate: record.vitals?.heartRate,
    }),
    nightStart: start,
    nightEnd: end,
    seed: attributionSeed(record.nightId),
  });

  expect(result.nightId).toBe(record.nightId);
  expect(result.wakeUps.map((wake) => wake.source)).toEqual(["stage", "stage"]);
  expect(result.wakeUps.every((wake) => wake.linkedEventId === null)).toBe(true);
  expect(result.followedSpike).toBe(expected.followedSpike);
  expect(result.randomWindowRate).toBe(expected.baselineRate);
  expect(result.night).toEqual({
    display: "counts",
    nightsPooled: 1,
    wakeUps: 2,
    followedSpike: 0,
    text: "0 of 2 wake-ups followed a spike",
  });
  expect(result.pooled).toEqual(result.night);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.value.attribution).toEqual({
    wakeUps: 2,
    followedSpike: 0,
    randomWindowRate: expected.baselineRate,
    nightsPooled: 1,
  });

  const again = await createAttributionService(nights).forNight(USER, record.nightId);
  expect(again).toEqual(result);

  const bpm = upload.sleep?.heartRate.find(([, value]) => !Number.isInteger(value));
  if (!bpm) throw new Error("fixture heart rate has no fractional sample");
  expect(JSON.stringify(result)).not.toContain(String(bpm[1]));
});

test("handling spikes are never linked, and 3 of 4 wake-ups followed a spike", async () => {
  const record = fixtureRecord();
  const start = Date.parse(record.startedAt) / 1000;
  const heartRate = record.vitals?.heartRate.map(
    (sample) => [sample[0], sample[1]] as [number, number],
  );
  if (!heartRate || !record.vitals) throw new Error("fixture has no heart rate");
  for (const index of [101, 201]) {
    const curr = heartRate[index];
    if (!curr) throw new Error(`missing heart sample ${index}`);
    // Fixture samples sit near 60. 80 is a sudden jump, clear of floating-point edges.
    heartRate[index] = [curr[0], 80];
  }
  const at = (minute: number) => start + minute * 60;
  record.vitals = { ...record.vitals, heartRate };
  record.events = [
    ...record.events,
    event("handling-early", at(101) - 100, "handling"),
    event("traffic-link", at(101) - 90, "traffic"),
    event("siren-link", at(137) - 90, "siren"),
    event("construction-link", at(201) - 90, "construction"),
    event("handling-late", at(461) - 90, "handling"),
  ];

  const { nights, writes } = memory([record]);
  const result = await createAttributionService(nights).forNight(USER, record.nightId);

  expect(result.wakeUps.map((wake) => wake.linkedEventId)).toEqual([
    "traffic-link",
    "siren-link",
    "construction-link",
    null,
  ]);
  expect(result.night).toEqual({
    display: "counts",
    nightsPooled: 1,
    wakeUps: 4,
    followedSpike: 3,
    text: "3 of 4 wake-ups followed a spike",
  });
  expect(writes[0]?.value.wakeUps.every((wake) => wake.linkedEventId !== "handling-early")).toBe(
    true,
  );
  expect(writes[0]?.value.wakeUps.every((wake) => wake.linkedEventId !== "handling-late")).toBe(
    true,
  );
});

test("an unlabelled spike can be linked and a handling spike cannot", async () => {
  const record = fixtureRecord();
  const start = Date.parse(record.startedAt) / 1000;
  record.events = [
    event("open", start + 137 * 60 - 90, null),
    event("pocket", start + 461 * 60 - 90, "handling"),
  ];
  const result = await createAttributionService(memory([record]).nights).forNight(
    USER,
    record.nightId,
  );
  expect(result.wakeUps.map((wake) => wake.linkedEventId)).toEqual(["open", null]);
  expect(result.night.text).toBe("1 of 2 wake-ups followed a spike");
});

test("a percentage only once pooled nights reach the constant", async () => {
  const record = fixtureRecord();
  const pending = preset(20, 0);
  pending.attribution = null;
  const enough = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE - 1 }, (_, index) =>
    preset(index + 1, 1),
  );
  const pooled = await createAttributionService(
    memory([record, pending, ...enough]).nights,
  ).forNight(USER, record.nightId);
  const wakeUps = 2 * MIN_NIGHTS_FOR_PERCENTAGE;
  const followedSpike = MIN_NIGHTS_FOR_PERCENTAGE - 1;
  expect(pooled.night.text).toBe("0 of 2 wake-ups followed a spike");
  expect(pooled.pooled).toEqual({
    display: "percentage",
    nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE,
    wakeUps,
    followedSpike,
    percent: (followedSpike / wakeUps) * 100,
    text: "40% of wake-ups followed a spike",
  });

  const fewer = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE - 2 }, (_, index) =>
    preset(index + 1, 1),
  );
  const counts = await createAttributionService(
    memory([fixtureRecord(), ...fewer]).nights,
  ).forNight(USER, record.nightId);
  const pooledNights = MIN_NIGHTS_FOR_PERCENTAGE - 1;
  expect(counts.pooled).toEqual({
    display: "counts",
    nightsPooled: pooledNights,
    wakeUps: 2 * pooledNights,
    followedSpike: pooledNights - 1,
    text: `${pooledNights - 1} of ${2 * pooledNights} wake-ups followed a spike`,
  });
});

test("another user's night and a night without health consent are refused", async () => {
  const record = fixtureRecord();
  const { nights, writes } = memory([record]);
  const svc = createAttributionService(nights);
  await expect(svc.forNight(OTHER, record.nightId)).rejects.toBeInstanceOf(NightNotFoundError);
  await expect(svc.forNight(USER, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(
    NightNotFoundError,
  );

  const withheld = fixtureRecord();
  withheld.consent = { ...withheld.consent, health: false };
  await expect(
    createAttributionService(memory([withheld]).nights).forNight(USER, withheld.nightId),
  ).rejects.toBeInstanceOf(NightConsentError);
  expect(writes).toHaveLength(0);
});

test("attribution.forNight stores the fixture and reports counts", async () => {
  const record = fixtureRecord();
  const svc = createAttributionService(memory([record]).nights);
  const caller = createCallerFactory(router({ attribution: createAttributionRouter(svc) }))({
    userId: USER,
  });
  const anon = createCallerFactory(router({ attribution: createAttributionRouter(svc) }))({
    userId: null,
  });
  const result = await caller.attribution.forNight({ nightId: record.nightId });
  expect(result.night.text).toBe("0 of 2 wake-ups followed a spike");
  expect(result.pooled.display).toBe("counts");

  await expect(anon.attribution.forNight({ nightId: record.nightId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  const other = createCallerFactory(router({ attribution: createAttributionRouter(svc) }))({
    userId: OTHER,
  });
  await expect(other.attribution.forNight({ nightId: record.nightId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const withheld = fixtureRecord();
  withheld.consent = { ...withheld.consent, health: false };
  const refused = createCallerFactory(
    router({
      attribution: createAttributionRouter(createAttributionService(memory([withheld]).nights)),
    }),
  )({ userId: USER });
  await expect(refused.attribution.forNight({ nightId: withheld.nightId })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
