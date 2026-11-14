// Regenerates src/night/fixtures/*.json: a deterministic 8-hour night in Newcastle with traffic,
// a siren, snoring and drilling at 06:41, before the 8am limit. Run: bun run fixtures:night
import { join } from "node:path";
import type { NightTimeline, NightUpload } from "../src/night";

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

const start = Date.parse("2026-11-13T23:00:00Z"); // Friday 23:00 GMT
const seconds = 8 * 60 * 60;
const t0 = start / 1000;
const iso = (t: number) => new Date(t * 1000).toISOString().replace(".000Z", "+00:00");

const spikeSpecs = [
  { at: 52 * 60, peak: 58, label: "traffic", len: 6 },
  { at: 2 * 3600 + 17 * 60, peak: 66, label: "siren", len: 25 },
  { at: 4 * 3600 + 5 * 60, peak: 54, label: "snoring", len: 4 },
  { at: 7 * 3600 + 41 * 60, peak: 71, label: "construction", len: 40 }, // 06:41
] as const;

const baselineDb = 32;
const samples: [number, number][] = [];
for (let i = 0; i < seconds; i++) {
  let db = baselineDb + (rand() - 0.5) * 3;
  for (const s of spikeSpecs) if (i >= s.at && i < s.at + s.len) db = s.peak - rand() * 4;
  samples.push([t0 + i, round1(db)]);
}

const spikes = spikeSpecs.map((s, k) => ({
  t: t0 + s.at,
  peakDb: s.peak,
  clipId: `clip-${k + 1}`,
}));
const stagePlan: [number, "inBed" | "awake" | "core" | "deep" | "rem"][] = [
  [0, "awake"],
  [15, "core"],
  [50, "deep"],
  [110, "core"],
  [137, "awake"],
  [140, "core"],
  [170, "rem"],
  [200, "core"],
  [240, "deep"],
  [290, "core"],
  [340, "rem"],
  [400, "core"],
  [461, "awake"],
  [464, "core"],
  [480, "awake"],
];
const stages = stagePlan.slice(0, -1).map(([m, stage], k) => ({
  start: iso(t0 + m * 60),
  end: iso(t0 + (stagePlan[k + 1]?.[0] ?? 480) * 60),
  stage,
}));
const every = (step: number, f: (i: number) => number): [number, number][] =>
  Array.from({ length: seconds / step }, (_, k) => [t0 + k * step, round1(f(k * step))]);

const upload: NightUpload = {
  nightId: "4f7b1c5e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
  userId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  startedAt: iso(t0),
  endedAt: iso(t0 + seconds),
  location: { lat: 54.9738, lon: -1.6132 },
  consent: { microphone: true, health: true, location: true },
  noise: { baselineDb, samples },
  spikes,
  sleep: {
    stages,
    heartRate: every(60, () => 56 + rand() * 6),
    hrv: every(300, () => 48 + rand() * 14),
    respiratoryRate: every(300, () => 13 + rand() * 2),
  },
};

const labels = spikeSpecs.map((s) => s.label);
const timeline: NightTimeline = {
  nightId: upload.nightId,
  night: "2026-11-13",
  startedAt: upload.startedAt,
  endedAt: upload.endedAt,
  baselineDb,
  // One point per minute: the loudest second, so spikes stay visible
  noise: Array.from({ length: seconds / 60 }, (_, m) => {
    const slice = samples.slice(m * 60, m * 60 + 60);
    return [t0 + m * 60, Math.max(...slice.map(([, db]) => db))] as [number, number];
  }),
  stages,
  events: spikes.map((s, k) => ({
    id: s.clipId,
    t: s.t,
    peakDb: s.peakDb,
    label: labels[k] ?? null,
    labelSources: { gemini: labels[k] ?? null, scribe: labels[k] ?? null },
    outsideRecommendedHours: labels[k] === "construction" ? true : null,
  })),
  wakeUps: [
    { t: t0 + 137 * 60 + 90, source: "stage", linkedEventId: "clip-2" },
    { t: t0 + 461 * 60 + 70, source: "stage", linkedEventId: "clip-4" },
    { t: t0 + 300 * 60, source: "heartRate", linkedEventId: null },
  ],
  attribution: { wakeUps: 3, followedSpike: 2, randomWindowRate: 0.04, nightsPooled: 1 },
  evidence: { hash: null, memoSignature: null },
};

const dir = join(import.meta.dir, "../src/night/fixtures");
await Bun.write(join(dir, "night-upload.json"), `${JSON.stringify(upload)}\n`);
await Bun.write(join(dir, "night-timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
console.log(`wrote ${samples.length} samples, ${spikes.length} spikes, ${stages.length} stages`);
