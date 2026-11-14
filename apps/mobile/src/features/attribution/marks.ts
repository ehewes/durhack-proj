import type { AttributionForNightOutput } from "@kip/shared/attribution";

export type WakeMark = {
  t: number;
  source: AttributionForNightOutput["wakeUps"][number]["source"];
  linkedEventId: string | null;
};

export type SpikeMark = {
  id: string;
  t: number;
};

export type AttributionMarks = {
  wakeUps: WakeMark[];
  /** Spikes a wake-up followed. A spike that only shares a timestamp is not included. */
  spikes: SpikeMark[];
};

/**
 * Marks for the night timeline. `linkedEventId` comes from `attribution.forNight`.
 * Hand-placed links on a night timeline are not an input.
 */
export function marksFromAttribution(
  result: Pick<AttributionForNightOutput, "wakeUps">,
  events: readonly { id: string; t: number }[],
): AttributionMarks {
  const byId = new Map(events.map((event) => [event.id, event]));
  const spikes: SpikeMark[] = [];
  const seen = new Set<string>();
  const wakeUps = result.wakeUps.map((wake) => ({
    t: wake.t,
    source: wake.source,
    linkedEventId: wake.linkedEventId,
  }));
  wakeUps.sort((a, b) => a.t - b.t || sourceRank(a.source) - sourceRank(b.source));

  for (const wake of wakeUps) {
    const id = wake.linkedEventId;
    if (!id || seen.has(id)) continue;
    const event = byId.get(id);
    if (!event || !Number.isFinite(event.t)) continue;
    seen.add(id);
    spikes.push({ id, t: event.t });
  }

  return { wakeUps, spikes };
}

/** 0 at `start`, 1 at `end`, clamped. */
export function fractionAlong(t: number, start: number, end: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

export function epochSeconds(iso: string): number {
  return Date.parse(iso) / 1000;
}

function sourceRank(source: WakeMark["source"]): number {
  return source === "stage" ? 0 : 1;
}
