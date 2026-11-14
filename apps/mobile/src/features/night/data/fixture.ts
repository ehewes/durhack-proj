import type { NightTimeline } from "@kip/shared/night";

// Offline fallback for `night.get`: a simulated night, never real data.
const START = Date.parse("2026-11-13T23:00:00Z") / 1000;
const END = START + 8 * 3600;
const at = (hour: number, minute = 0) => START + hour * 3600 + minute * 60;
const iso = (t: number) => new Date(t * 1000).toISOString();

const spikes = [
  { id: "ev-1", t: at(2, 10), peakDb: 58, label: "construction" as const },
  { id: "ev-2", t: at(4, 40), peakDb: 54, label: "siren" as const },
  { id: "ev-3", t: at(6, 5), peakDb: 49, label: "traffic" as const },
];

const stageSpans = [
  [0, 0.5, "awake"],
  [0.5, 2, "core"],
  [2, 3.2, "deep"],
  [3.2, 4.3, "rem"],
  [4.3, 4.9, "awake"],
  [4.9, 6.2, "core"],
  [6.2, 7.2, "rem"],
  [7.2, 8, "core"],
] as const;

const noise: [number, number][] = [];
for (let t = START; t <= END; t += 300) {
  const wobble = Math.sin((t - START) / 900) * 0.6;
  const spike = spikes.find((s) => Math.abs(s.t - t) <= 300);
  noise.push([t, Math.round((33.5 + wobble + (spike ? spike.peakDb - 33.5 : 0)) * 10) / 10]);
}

export const fixtureNight: NightTimeline = {
  nightId: "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
  night: "2026-11-13",
  startedAt: "2026-11-13T23:00:00+00:00",
  endedAt: "2026-11-14T07:00:00+00:00",
  baselineDb: 32,
  noise,
  stages: stageSpans.map(([from, to, stage]) => ({
    start: iso(START + from * 3600),
    end: iso(START + to * 3600),
    stage,
  })),
  events: spikes.map((s) => ({
    ...s,
    labelSources: { gemini: s.label, scribe: s.label },
    outsideRecommendedHours: s.label === "construction" ? true : null,
  })),
  wakeUps: [
    { t: at(2, 14), source: "heartRate", linkedEventId: "ev-1" },
    { t: at(4, 45), source: "stage", linkedEventId: "ev-2" },
    { t: at(5, 30), source: "stage", linkedEventId: null },
  ],
  attribution: null,
  evidence: { hash: null, memoSignature: null },
};
