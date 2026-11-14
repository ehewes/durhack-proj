import { expect, test } from "bun:test";
import type { NightDocument } from "@kip/shared/night";
import { type NightUpload, nightTimeline, nightUpload } from "@kip/shared/night";
import nightTimelineFixture from "../../../../../packages/shared/src/night/fixtures/night-timeline.json";
import nightUploadFixture from "../../../../../packages/shared/src/night/fixtures/night-upload.json";
import { createCallerFactory, router } from "../../trpc/init";
import { NightConsentError, NightEventNotFoundError, NightNotFoundError } from "./errors";
import type { NightDeleteCounts, NightRepo, NightSeries, NightWrite } from "./repo";
import { createNightRouter } from "./router";
import { createNightService } from "./service";

const upload = nightUpload.parse(nightUploadFixture);
const timeline = nightTimeline.parse(nightTimelineFixture);
const USER = upload.userId;
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMemoryRepo(): { repo: NightRepo; saves: NightWrite[] } {
  const documents = new Map<string, NightDocument>();
  const series = new Map<string, NightSeries>();
  const saves: NightWrite[] = [];
  const repo: NightRepo = {
    async save(write) {
      saves.push(structuredClone(write));
      documents.set(write.document.nightId, structuredClone(write.document));
      series.set(
        write.document.nightId,
        structuredClone({
          noise: [...write.noise],
          stages: [...write.stages],
          vitals: write.vitals
            ? {
                heartRate: [...write.vitals.heartRate],
                hrv: [...write.vitals.hrv],
                respiratoryRate: [...write.vitals.respiratoryRate],
              }
            : null,
        }),
      );
    },
    async getDocument(nightId) {
      const document = documents.get(nightId);
      return document ? structuredClone(document) : null;
    },
    async readSeries(nightId) {
      const found = series.get(nightId);
      return found ? structuredClone(found) : { noise: [], stages: [], vitals: null };
    },
    async listDocuments(userId) {
      return [...documents.values()]
        .filter((document) => document.userId === userId)
        .map((document) => structuredClone(document));
    },
    async updateDocument(document) {
      if (!documents.has(document.nightId)) throw new Error("missing");
      documents.set(document.nightId, structuredClone(document));
    },
    async deleteUser(userId) {
      const ids = [...documents.values()]
        .filter((document) => document.userId === userId)
        .map((document) => document.nightId);
      const counts: NightDeleteCounts = {
        nights: ids.length,
        noiseRows: 0,
        vitalRows: 0,
        stageRows: 0,
      };
      for (const id of ids) {
        const stored = series.get(id);
        if (stored) {
          counts.noiseRows += stored.noise.length;
          counts.stageRows += stored.stages.length;
          if (stored.vitals) {
            counts.vitalRows +=
              stored.vitals.heartRate.length +
              stored.vitals.hrv.length +
              stored.vitals.respiratoryRate.length;
          }
        }
        documents.delete(id);
        series.delete(id);
      }
      return counts;
    },
  };
  return { repo, saves };
}

function harness(userId = USER) {
  const { repo, saves } = createMemoryRepo();
  const svc = createNightService(repo);
  const caller = createCallerFactory(router({ night: createNightRouter(svc) }))({ userId });
  return { svc, saves, caller };
}

test("night.upload stores the fixture once and night.get draws the timeline", async () => {
  const { svc, saves, caller } = harness();
  const first = await caller.night.upload(upload);
  const second = await caller.night.upload(upload);
  expect(second).toEqual(first);
  expect(saves).toHaveLength(1);
  expect(first).toMatchObject({
    nightId: upload.nightId,
    userId: USER,
    night: timeline.night,
    eventCount: 4,
    wakeUpCount: 0,
    attribution: null,
    evidence: { hash: null, memoSignature: null },
  });
  expect(saves[0]?.noise).toHaveLength(8 * 60 * 60);
  expect(saves[0]?.stages).toHaveLength(upload.sleep?.stages.length ?? 0);
  expect(saves[0]?.vitals?.heartRate).toEqual(upload.sleep?.heartRate);

  const drawn = await caller.night.get({ nightId: upload.nightId });
  expect(drawn.noise).toEqual(timeline.noise);
  expect(drawn.stages).toEqual(timeline.stages);
  expect(drawn.events.map((event) => event.id)).toEqual(timeline.events.map((event) => event.id));
  expect(drawn.events.every((event) => event.label === null)).toBe(true);
  expect(drawn).not.toHaveProperty("vitals");
  expect(JSON.stringify(drawn)).not.toContain("54.9738");

  const record = await svc.getNight(upload.nightId);
  expect(record?.vitals?.heartRate).toEqual(upload.sleep?.heartRate);
  expect(record?.location).toEqual(upload.location);

  await expect(
    svc.addEventLabels(OTHER, upload.nightId, [{ id: "clip-1", gemini: "traffic" }]),
  ).rejects.toBeInstanceOf(NightNotFoundError);
  await svc.addEventLabels(
    USER,
    upload.nightId,
    timeline.events.map((event) => ({
      id: event.id,
      gemini: event.labelSources.gemini,
      scribe: event.labelSources.scribe,
    })),
  );
  await caller.night.upload({ ...upload, noise: { baselineDb: 1, samples: [[1, 1]] } });
  expect(saves).toHaveLength(1);
  const labelled = await caller.night.get({ nightId: upload.nightId });
  expect(labelled.events).toEqual(timeline.events);
  expect(labelled.baselineDb).toBe(upload.noise.baselineDb);

  const listed = await caller.night.list();
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    labelCounts: { construction: 1, traffic: 1, siren: 1, snoring: 1 },
    outsideRecommendedHoursCount: 1,
  });
  expect(JSON.stringify(listed)).not.toContain("heartRate");
});

test("health series and location are stored only with consent", async () => {
  const { svc, saves, caller } = harness();
  const nightId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await caller.night.upload({
    ...upload,
    nightId,
    consent: { microphone: true, health: false, location: false },
  });
  const write = saves[0];
  expect(write?.stages).toEqual([]);
  expect(write?.vitals).toBeNull();
  expect(write?.document.location).toBeNull();
  expect(JSON.stringify(write?.document)).not.toContain("heartRate");
  expect(JSON.stringify(write?.document)).not.toContain("54.9738");
  const record = await svc.getNight(nightId);
  expect(record?.stages).toEqual([]);
  expect(record?.vitals).toBeNull();
  expect(record?.location).toBeNull();
  const attribution = timeline.attribution;
  if (!attribution) throw new Error("fixture has no attribution");
  await expect(
    svc.setAttribution(USER, nightId, { wakeUps: timeline.wakeUps, attribution }),
  ).rejects.toBeInstanceOf(NightConsentError);

  const quiet = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await caller.night.upload({
    ...upload,
    nightId: quiet,
    consent: { microphone: false, health: false, location: false },
  });
  expect(saves[1]?.noise).toEqual([]);
  expect(saves[1]?.document.events).toEqual([]);
  expect(saves[1]?.document.baselineDb).toBe(0);
});

test("a night is visible only to its user, and delete removes Tiger rows and the summary", async () => {
  const { svc, caller } = harness();
  await caller.night.upload(upload);
  const other = createCallerFactory(router({ night: createNightRouter(svc) }))({ userId: OTHER });
  await expect(other.night.upload(upload)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.night.get({ nightId: upload.nightId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(other.night.upload({ ...upload, userId: OTHER })).rejects.toMatchObject({
    code: "CONFLICT",
  });

  const later: NightUpload = {
    ...upload,
    nightId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    startedAt: "2026-11-14T23:00:00+00:00",
    endedAt: "2026-11-15T07:00:00+00:00",
    sleep: undefined,
    consent: { microphone: true, health: false, location: false },
    spikes: [],
    noise: { baselineDb: 30, samples: [[Date.parse("2026-11-14T23:00:00+00:00") / 1000, 31]] },
  };
  await caller.night.list();
  await caller.night.upload(later);
  const listed = await caller.night.list();
  expect(listed.map((night) => night.nightId)).toEqual([later.nightId, upload.nightId]);

  await expect(
    svc.addEventLabels(USER, upload.nightId, [{ id: "missing", gemini: "traffic" }]),
  ).rejects.toBeInstanceOf(NightEventNotFoundError);

  const attribution = timeline.attribution;
  if (!attribution || !upload.sleep) throw new Error("fixture missing sleep");
  await svc.setAttribution(USER, upload.nightId, { wakeUps: timeline.wakeUps, attribution });
  await svc.setEvidence(USER, upload.nightId, { hash: "abc", memoSignature: "sig" });
  const got = await caller.night.get({ nightId: upload.nightId });
  expect(got.wakeUps).toEqual(timeline.wakeUps);
  expect(got.attribution).toEqual(attribution);
  expect(got.evidence).toEqual({ hash: "abc", memoSignature: "sig" });

  const counts = await svc.deleteUserNights(USER);
  expect(counts).toEqual({
    nights: 2,
    noiseRows: upload.noise.samples.length + 1,
    vitalRows:
      upload.sleep.heartRate.length + upload.sleep.hrv.length + upload.sleep.respiratoryRate.length,
    stageRows: upload.sleep.stages.length,
  });
  await expect(caller.night.get({ nightId: upload.nightId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await caller.night.list()).toEqual([]);
});

test("night.upload rejects a body that is not a NightUpload", async () => {
  const { caller } = harness();
  await expect(caller.night.upload({ nightId: "nope" } as NightUpload)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
});
