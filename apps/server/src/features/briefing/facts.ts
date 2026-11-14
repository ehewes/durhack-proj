import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { type NoiseLabel, toLocalTime } from "@kip/shared/domain";
import type { NightRecord } from "../night";

/** Sounds Kip may say. Handling is the phone itself and is left out. */
const SPOKEN_SOUND = {
  construction: "drilling",
  traffic: "traffic",
  siren: "a siren",
  snoring: "snoring",
  other: "other noise",
  uncertain: "an uncertain sound",
} as const;

type BriefableLabel = keyof typeof SPOKEN_SOUND;

export type BriefingEventFact = {
  sound: string;
  time: string;
  outsideRecommendedHours: boolean;
  wakeUpsThatFollowedIt: number;
};

/** Counts, labels and out-of-hours flags. No handling events and no levels. */
export type BriefingFacts = {
  wakeUps: number;
  wakeUpsThatFollowedANoiseEvent: number;
  events: BriefingEventFact[];
};

function isBriefable(label: NoiseLabel | null): label is BriefableLabel {
  return label !== null && label !== "handling" && Object.hasOwn(SPOKEN_SOUND, label);
}

/** Europe/London wall clock, HH:MM. */
export function briefingClock(epochSec: number): string {
  const { minutes } = toLocalTime(new Date(epochSec * 1000));
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Facts for the morning briefing.
 * `attribution` is the `forNight` result. Without health consent it is null,
 * and wake-ups are left out rather than read from the night record.
 */
export function briefingFacts(
  record: NightRecord,
  attribution: AttributionForNightOutput | null,
): BriefingFacts {
  const followed = new Map<string, number>();
  for (const wake of attribution?.wakeUps ?? []) {
    if (!wake.linkedEventId) continue;
    followed.set(wake.linkedEventId, (followed.get(wake.linkedEventId) ?? 0) + 1);
  }

  const events: BriefingEventFact[] = [];
  const ordered = [...record.events].sort((a, b) => a.t - b.t);
  for (const event of ordered) {
    if (!isBriefable(event.label)) continue;
    events.push({
      sound: SPOKEN_SOUND[event.label],
      time: briefingClock(event.t),
      outsideRecommendedHours: event.outsideRecommendedHours === true,
      wakeUpsThatFollowedIt: followed.get(event.id) ?? 0,
    });
  }

  return {
    wakeUps: attribution?.wakeUps.length ?? 0,
    wakeUpsThatFollowedANoiseEvent: attribution?.followedSpike ?? 0,
    events,
  };
}
