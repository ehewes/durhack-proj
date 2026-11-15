import { attributionForNightOutput } from "@kip/shared/attribution";

/**
 * Captured `attribution.forNight` result for the shared night upload
 * (night id 4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f).
 *
 * The night timeline fixture hand-places 3 wake-ups and 2 links. forNight on
 * that upload reports 2 stage wake-ups and no links: the siren (clip-2) and
 * the construction spike (clip-4) sit on the awake-stage starts, outside the
 * 60 to 120 second window. randomWindowRate is 0.011 (11 of 1000 windows).
 * #135 lines the two fixtures up. Recapture this result once it lands; the
 * attribution test compares it with the fixtures.
 */
export const DEMO_NIGHT_ID = "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

export const demoWindow = {
  startedAt: "2026-11-13T23:00:00+00:00",
  endedAt: "2026-11-14T07:00:00+00:00",
} as const;

/** Spike times from the same upload. None of them is a link. */
export const demoEvents = [
  { id: "clip-1", t: 1794613920 },
  { id: "clip-2", t: 1794619020 },
  { id: "clip-3", t: 1794625500 },
  { id: "clip-4", t: 1794638460 },
] as const;

export const demoAttribution = attributionForNightOutput.parse({
  nightId: DEMO_NIGHT_ID,
  wakeUps: [
    { t: 1794619020, source: "stage", linkedEventId: null },
    { t: 1794638460, source: "stage", linkedEventId: null },
  ],
  followedSpike: 0,
  randomWindowRate: 0.011,
  night: {
    display: "counts",
    nightsPooled: 1,
    wakeUps: 2,
    followedSpike: 0,
    text: "0 of 2 wake-ups followed a spike",
  },
  pooled: {
    display: "counts",
    nightsPooled: 1,
    wakeUps: 2,
    followedSpike: 0,
    text: "0 of 2 wake-ups followed a spike",
  },
});
