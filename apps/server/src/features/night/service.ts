import { nightOf } from "@kip/shared/domain";
import {
  type AttributionWrite,
  applyEventLabel,
  attributionWrite,
  downsampleNoise,
  type EventLabelPatch,
  eventLabelPatch,
  eventsFromSpikes,
  evidenceRecord,
  type NightDocument,
  type NightSummary,
  type NightTimeline,
  type NightUpload,
  nightDocument,
  nightSummary,
  nightTimeline,
} from "@kip/shared/night";
import { z } from "zod";
import {
  NightConflictError,
  NightConsentError,
  NightEventNotFoundError,
  NightNotFoundError,
} from "./errors";
import {
  createNightRepo,
  type NightDeleteCounts,
  type NightRepo,
  type NightSeries,
  type NightVitals,
  type NightWrite,
} from "./repo";

export type { NightDeleteCounts, NightVitals };

/** Timeline plus the fields other features need. `vitals` is null without health consent. */
export type NightRecord = NightTimeline & {
  userId: string;
  consent: NightUpload["consent"];
  location: { lat: number; lon: number } | null;
  vitals: NightVitals | null;
};

/** Writes take the owner's userId and report another user's night as missing. */
export type NightService = {
  uploadNight(input: NightUpload): Promise<NightSummary>;
  getNight(nightId: string): Promise<NightRecord | null>;
  listNights(userId: string): Promise<NightSummary[]>;
  addEventLabels(
    userId: string,
    nightId: string,
    patches: readonly EventLabelPatch[],
  ): Promise<NightRecord>;
  setAttribution(userId: string, nightId: string, value: AttributionWrite): Promise<NightRecord>;
  setEvidence(
    userId: string,
    nightId: string,
    evidence: NightDocument["evidence"],
  ): Promise<NightRecord>;
  deleteUserNights(userId: string): Promise<NightDeleteCounts>;
};

const labelPatches = z.array(eventLabelPatch);

function toWrite(input: NightUpload): NightWrite {
  const microphone = input.consent.microphone;
  const sleep = input.consent.health ? input.sleep : undefined;
  const document = nightDocument.parse({
    nightId: input.nightId,
    userId: input.userId,
    night: nightOf(new Date(input.startedAt)),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    baselineDb: microphone ? input.noise.baselineDb : 0,
    location: input.consent.location && input.location ? input.location : null,
    consent: input.consent,
    events: microphone ? eventsFromSpikes(input.spikes) : [],
    wakeUps: [],
    attribution: null,
    evidence: { hash: null, memoSignature: null },
  });
  return {
    document,
    noise: microphone ? input.noise.samples : [],
    stages: sleep ? sleep.stages : [],
    vitals: sleep
      ? { heartRate: sleep.heartRate, hrv: sleep.hrv, respiratoryRate: sleep.respiratoryRate }
      : null,
  };
}

function toSummary(document: NightDocument): NightSummary {
  const labelCounts: NightSummary["labelCounts"] = {};
  let outsideRecommendedHoursCount = 0;
  for (const event of document.events) {
    if (event.label) labelCounts[event.label] = (labelCounts[event.label] ?? 0) + 1;
    if (event.outsideRecommendedHours) outsideRecommendedHoursCount += 1;
  }
  return nightSummary.parse({
    nightId: document.nightId,
    userId: document.userId,
    night: document.night,
    startedAt: document.startedAt,
    endedAt: document.endedAt,
    eventCount: document.events.length,
    labelCounts,
    outsideRecommendedHoursCount,
    wakeUpCount: document.wakeUps.length,
    attribution: document.attribution,
    evidence: document.evidence,
  });
}

function toRecord(document: NightDocument, series: NightSeries): NightRecord {
  const origin = Date.parse(document.startedAt) / 1000;
  const health = document.consent.health;
  const timeline = nightTimeline.parse({
    nightId: document.nightId,
    night: document.night,
    startedAt: document.startedAt,
    endedAt: document.endedAt,
    baselineDb: document.baselineDb,
    noise: document.consent.microphone ? downsampleNoise(series.noise, origin) : [],
    stages: health ? series.stages : [],
    events: document.events,
    wakeUps: health ? document.wakeUps : [],
    attribution: health ? document.attribution : null,
    evidence: document.evidence,
  });
  return {
    ...timeline,
    userId: document.userId,
    consent: document.consent,
    location: document.consent.location ? document.location : null,
    vitals: health ? series.vitals : null,
  };
}

function byStartedDesc(a: NightDocument, b: NightDocument): number {
  return Date.parse(b.startedAt) - Date.parse(a.startedAt);
}

export function createNightService(repo: NightRepo): NightService {
  async function requireDocument(nightId: string): Promise<NightDocument> {
    const document = await repo.getDocument(nightId);
    if (!document) throw new NightNotFoundError(nightId);
    return document;
  }

  async function requireRecord(nightId: string): Promise<NightRecord> {
    const document = await requireDocument(nightId);
    return toRecord(document, await repo.readSeries(nightId));
  }

  async function owned(userId: string, nightId: string): Promise<NightDocument> {
    const document = await requireDocument(nightId);
    if (document.userId !== userId) throw new NightNotFoundError(nightId);
    return document;
  }

  return {
    async uploadNight(input) {
      const existing = await repo.getDocument(input.nightId);
      if (existing) {
        if (existing.userId !== input.userId) throw new NightConflictError(input.nightId);
        return toSummary(existing);
      }
      const write = toWrite(input);
      await repo.save(write);
      return toSummary(write.document);
    },

    async getNight(nightId) {
      const document = await repo.getDocument(nightId);
      if (!document) return null;
      return toRecord(document, await repo.readSeries(nightId));
    },

    async listNights(userId) {
      const documents = await repo.listDocuments(userId);
      return [...documents].sort(byStartedDesc).map(toSummary);
    },

    async addEventLabels(userId, nightId, patches) {
      const parsed = labelPatches.parse(patches);
      const document = await owned(userId, nightId);
      const events = document.events.map((event) => ({ ...event }));
      for (const patch of parsed) {
        const index = events.findIndex((event) => event.id === patch.id);
        const event = events[index];
        if (!event) throw new NightEventNotFoundError(patch.id);
        events[index] = applyEventLabel(event, patch);
      }
      await repo.updateDocument({ ...document, events });
      return requireRecord(nightId);
    },

    async setAttribution(userId, nightId, value) {
      const parsed = attributionWrite.parse(value);
      const document = await owned(userId, nightId);
      if (!document.consent.health) throw new NightConsentError();
      await repo.updateDocument({
        ...document,
        wakeUps: parsed.wakeUps,
        attribution: parsed.attribution,
      });
      return requireRecord(nightId);
    },

    async setEvidence(userId, nightId, evidence) {
      const parsed = evidenceRecord.parse(evidence);
      const document = await owned(userId, nightId);
      await repo.updateDocument({ ...document, evidence: parsed });
      return requireRecord(nightId);
    },

    deleteUserNights(userId) {
      return repo.deleteUser(userId);
    },
  };
}

const liveNight = createNightService(createNightRepo());

export const uploadNight = liveNight.uploadNight;
export const getNight = liveNight.getNight;
export const listNights = liveNight.listNights;
export const addEventLabels = liveNight.addEventLabels;
export const setAttribution = liveNight.setAttribution;
export const setEvidence = liveNight.setEvidence;
export const deleteUserNights = liveNight.deleteUserNights;

export { liveNight };
