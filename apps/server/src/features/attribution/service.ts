import {
  type AttributionForNightOutput,
  attributionForNightOutput,
  toAttributionView,
} from "@kip/shared/attribution";
import {
  ATTRIBUTION_WINDOW_SECONDS,
  detectWakeUps,
  linkWakeUps,
  type StageInterval,
} from "@kip/shared/domain";
import type { AttributionWrite, NightEvent, NightSummary } from "@kip/shared/night";
import {
  getNight,
  NightConsentError,
  NightNotFoundError,
  type NightRecord,
  setAttribution,
} from "../night";
// `listNights` is a night storage function. The night barrel does not re-export it yet.
import { listNights } from "../night/service";

/** Night storage this feature is allowed to use. */
export type AttributionNights = {
  getNight(nightId: string): Promise<NightRecord | null>;
  setAttribution(userId: string, nightId: string, value: AttributionWrite): Promise<NightRecord>;
  /** Must include a night just written by `setAttribution`. */
  listNights(userId: string): Promise<NightSummary[]>;
};

/** Same night id, same random-window baseline. */
export function attributionSeed(nightId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < nightId.length; i++) {
    hash ^= nightId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function epoch(iso: string): number {
  return Date.parse(iso) / 1000;
}

function stagesOf(record: NightRecord): StageInterval[] {
  return record.stages.map((stage) => ({
    start: epoch(stage.start),
    end: epoch(stage.end),
    stage: stage.stage,
  }));
}

/** Handling noise is the phone itself. It is never a spike a wake-up can follow. */
function countsAsSpike(event: NightEvent): boolean {
  return event.label !== "handling" && Number.isFinite(event.t);
}

function linkedEventId(events: readonly NightEvent[], wakeT: number): string | null {
  const { min, max } = ATTRIBUTION_WINDOW_SECONDS;
  let best: NightEvent | null = null;
  for (const event of events) {
    if (!countsAsSpike(event)) continue;
    const delta = wakeT - event.t;
    if (delta < min || delta > max) continue;
    if (!best || event.t > best.t) best = event;
  }
  return best?.id ?? null;
}

function compute(record: NightRecord) {
  const sessionStart = epoch(record.startedAt);
  const sessionEnd = epoch(record.endedAt);
  const detected = detectWakeUps({
    sessionStart,
    sessionEnd,
    stages: stagesOf(record),
    heartRate: record.vitals?.heartRate,
  });
  const followed = linkWakeUps({
    spikes: record.events.filter(countsAsSpike).map((event) => ({ t: event.t })),
    wakeUps: detected,
    nightStart: sessionStart,
    nightEnd: sessionEnd,
    seed: attributionSeed(record.nightId),
  });
  const wakeUps = detected.map((wake) => ({
    t: wake.t,
    source: wake.source,
    linkedEventId: linkedEventId(record.events, wake.t),
  }));
  return { wakeUps, followed };
}

function pooledRows(
  summaries: readonly NightSummary[],
  nightId: string,
  written: { wakeUps: number; followedSpike: number },
): { wakeUps: number; followedSpike: number }[] {
  const rows: { wakeUps: number; followedSpike: number }[] = [];
  let seen = false;
  for (const summary of summaries) {
    const attribution = summary.attribution;
    if (!attribution) continue;
    if (summary.nightId === nightId) seen = true;
    rows.push({ wakeUps: attribution.wakeUps, followedSpike: attribution.followedSpike });
  }
  if (!seen) rows.push(written);
  return rows;
}

export function createAttributionService(nights: AttributionNights) {
  return {
    async forNight(userId: string, nightId: string): Promise<AttributionForNightOutput> {
      const record = await nights.getNight(nightId);
      if (!record || record.userId !== userId) throw new NightNotFoundError(nightId);
      if (!record.consent.health) throw new NightConsentError();

      const { wakeUps, followed } = compute(record);
      const written = { wakeUps: followed.wakeUps, followedSpike: followed.followedSpike };
      const stored = await nights.setAttribution(userId, nightId, {
        wakeUps,
        attribution: {
          wakeUps: followed.wakeUps,
          followedSpike: followed.followedSpike,
          randomWindowRate: followed.baselineRate,
          nightsPooled: 1,
        },
      });
      const summaries = await nights.listNights(userId);
      return attributionForNightOutput.parse({
        nightId,
        wakeUps: stored.wakeUps,
        followedSpike: written.followedSpike,
        randomWindowRate: followed.baselineRate,
        night: toAttributionView([written]),
        pooled: toAttributionView(pooledRows(summaries, nightId, written)),
      });
    },
  };
}

export type AttributionService = ReturnType<typeof createAttributionService>;

const live = createAttributionService({ getNight, setAttribution, listNights });

export const forNight = live.forNight;
