import { z } from "zod";
import { pooledAttribution, SAY_FOLLOWED } from "../domain";
import { wakeUp } from "../night/timeline";

const count = z.number().int().nonnegative();

/** Counts until enough nights are pooled; a percentage only after that. */
export const attributionView = z.discriminatedUnion("display", [
  z.object({
    display: z.literal("counts"),
    nightsPooled: count,
    wakeUps: count,
    followedSpike: count,
    /** "3 of 4 wake-ups followed a spike" */
    text: z.string().min(1),
  }),
  z.object({
    display: z.literal("percentage"),
    nightsPooled: count,
    wakeUps: count,
    followedSpike: count,
    /** 100 * followedSpike / wakeUps. */
    percent: z.number(),
    /** "50% of wake-ups followed a spike" */
    text: z.string().min(1),
  }),
]);

export type AttributionView = z.infer<typeof attributionView>;

export const attributionForNightInput = z.object({
  nightId: z.uuid(),
});

export type AttributionForNightInput = z.infer<typeof attributionForNightInput>;

/** What `attribution.forNight` returns. One night is counts; `pooled` may be a percentage. */
export const attributionForNightOutput = z.object({
  nightId: z.uuid(),
  wakeUps: z.array(wakeUp),
  followedSpike: count,
  /** Share of random windows from this night that contained a spike. */
  randomWindowRate: z.number().min(0).max(1),
  /** This night on its own. */
  night: attributionView,
  /** Every night already attributed for this user. */
  pooled: attributionView,
});

export type AttributionForNightOutput = z.infer<typeof attributionForNightOutput>;

function wakeUpNoun(wakeUps: number): string {
  return wakeUps === 1 ? "wake-up" : "wake-ups";
}

function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Sentence for a pooled attribution. Counts until `MIN_NIGHTS_FOR_PERCENTAGE`,
 * then a percentage. Wording follows docs/DOMAIN.md: "followed", never "caused by".
 */
export function toAttributionView(
  nights: readonly { wakeUps: number; followedSpike: number }[],
): AttributionView {
  const summary = pooledAttribution(nights);
  if (summary.display === "percentage") {
    return attributionView.parse({
      display: "percentage",
      nightsPooled: summary.nightsPooled,
      wakeUps: summary.wakeUps,
      followedSpike: summary.followedSpike,
      percent: summary.percent,
      text: `${formatPercent(summary.percent)}% of wake-ups ${SAY_FOLLOWED} a spike`,
    });
  }
  return attributionView.parse({
    display: "counts",
    nightsPooled: summary.nightsPooled,
    wakeUps: summary.wakeUps,
    followedSpike: summary.followedSpike,
    text: `${summary.followedSpike} of ${summary.wakeUps} ${wakeUpNoun(summary.wakeUps)} ${SAY_FOLLOWED} a spike`,
  });
}
