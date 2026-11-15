import { nightOf } from "@kip/shared/domain";
import { eventsFromSpikes, type NightDocument, nightDocument } from "@kip/shared/night";
import type { NightDeleteCounts, NightWrite, Sample, SimulatedNightStore } from "./repo";

/**
 * A neighbourhood simulated Kip users live in. Each person sleeps at a random home inside the
 * disc, with their phone on the nightstand and a Watch on their wrist.
 */
export type SimulatedArea = {
  name: string;
  /** Approximate centre, on land */
  lat: number;
  lon: number;
  /** Homes fall anywhere within this many metres of the centre */
  radiusM: number;
  /** Simulated people living here */
  people: number;
  /** 0 to 1: how much nightlife and traffic the area has, for louder nights and more spikes */
  lively: number;
};

/**
 * Newcastle and Gateshead neighbourhoods within about 4 km of Grey's Monument, weighted towards
 * student and city-centre areas, where an early Kip user would most plausibly live. Discs near
 * the Tyne are kept small so homes stay on the right bank. Approximate centres, not addresses.
 */
export const NEWCASTLE_AREAS: readonly SimulatedArea[] = [
  { name: "City Centre", lat: 54.9746, lon: -1.6132, radiusM: 350, people: 8, lively: 1 },
  { name: "Haymarket and Leazes", lat: 54.979, lon: -1.617, radiusM: 300, people: 6, lively: 0.8 },
  { name: "Quayside", lat: 54.9705, lon: -1.602, radiusM: 220, people: 5, lively: 0.9 },
  { name: "Ouseburn", lat: 54.9735, lon: -1.5905, radiusM: 300, people: 4, lively: 0.7 },
  { name: "Shieldfield", lat: 54.9805, lon: -1.6, radiusM: 300, people: 4, lively: 0.4 },
  { name: "Sandyford", lat: 54.986, lon: -1.603, radiusM: 400, people: 7, lively: 0.4 },
  { name: "Jesmond", lat: 54.9895, lon: -1.608, radiusM: 500, people: 9, lively: 0.5 },
  { name: "Heaton", lat: 54.985, lon: -1.581, radiusM: 500, people: 9, lively: 0.3 },
  { name: "Byker", lat: 54.9765, lon: -1.576, radiusM: 400, people: 5, lively: 0.3 },
  { name: "Walker", lat: 54.976, lon: -1.552, radiusM: 400, people: 2, lively: 0.2 },
  { name: "Spital Tongues", lat: 54.982, lon: -1.629, radiusM: 350, people: 4, lively: 0.2 },
  { name: "Fenham", lat: 54.983, lon: -1.655, radiusM: 500, people: 6, lively: 0.2 },
  { name: "Arthur's Hill", lat: 54.9745, lon: -1.639, radiusM: 350, people: 5, lively: 0.4 },
  { name: "Elswick", lat: 54.9665, lon: -1.643, radiusM: 300, people: 4, lively: 0.3 },
  { name: "Benwell", lat: 54.97, lon: -1.668, radiusM: 400, people: 3, lively: 0.2 },
  { name: "Gateshead", lat: 54.9575, lon: -1.606, radiusM: 450, people: 5, lively: 0.4 },
  { name: "Gosforth", lat: 55.005, lon: -1.619, radiusM: 500, people: 5, lively: 0.3 },
];

export type SeedOptions = {
  nightsPerUser: number;
  /** Nights end before this instant: the newest is the last one already over. */
  now: Date;
};

export const DEFAULT_SEED: Omit<SeedOptions, "now"> = { nightsPerUser: 5 };

const MINUTE_S = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const M_PER_DEG_LAT = 111_320;
/** The latest anyone wakes: 08:30 UTC plus the nightly jitter. */
const LATEST_WAKE_UTC_MINUTES = 9 * 60;

/** mulberry32. Same seed, same stream, on every machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A v4-shaped uuid drawn from the stream. */
function uuid(next: () => number): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join("");
  const variant = (8 + Math.floor(next() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** A uniformly random point in the area's disc: the square root keeps homes from bunching. */
function homeIn(area: SimulatedArea, next: () => number): { lat: number; lon: number } {
  const distance = area.radiusM * Math.sqrt(next());
  const bearing = 2 * Math.PI * next();
  const dLat = (distance * Math.cos(bearing)) / M_PER_DEG_LAT;
  const dLon =
    (distance * Math.sin(bearing)) / (M_PER_DEG_LAT * Math.cos((area.lat * Math.PI) / 180));
  return { lat: +(area.lat + dLat).toFixed(6), lon: +(area.lon + dLon).toFixed(6) };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function offsetIso(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** Midnight UTC of the newest night's evening: the last night everyone has woken from by `now`. */
function newestEvening(now: Date): number {
  const today = Date.parse(`${isoDate(now.getTime())}T00:00:00Z`);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return today - (minutes >= LATEST_WAKE_UTC_MINUTES ? 1 : 2) * DAY_MS;
}

/**
 * Deterministic made-up nights: relative dB only, microphone and location consent, no health
 * series. They are meant for the simulated store, which flags each one `simulated: true`.
 */
export function buildSimulatedNights(
  areas: readonly SimulatedArea[],
  options: SeedOptions,
): NightWrite[] {
  const writes: NightWrite[] = [];
  const newest = newestEvening(options.now);
  let person = 0;
  for (const area of areas) {
    for (let i = 0; i < area.people; i += 1) {
      const next = prng(1000 + person);
      person += 1;
      const userId = uuid(next);
      const home = homeIn(area, next);
      // A person's habits: bedtime 22:30 to 01:00 and waking 06:00 to 08:30 (UTC).
      const bedtime = 22.5 * 60 + next() * 150;
      const waking = 6 * 60 + next() * 150;
      const loudness = 3 + area.lively * 5 + next() * 4;
      const spikiness = 1 + area.lively * 4;
      for (let n = 0; n < options.nightsPerUser; n += 1) {
        const evening = newest - n * DAY_MS;
        const jitter = () => Math.round((next() - 0.5) * 40);
        const start = evening / 1000 + (bedtime + jitter()) * MINUTE_S;
        const end = (evening + DAY_MS) / 1000 + (waking + jitter()) * MINUTE_S;
        const noise: Sample[] = [];
        for (let t = start; t < end; t += MINUTE_S) {
          noise.push([t, +(loudness + next() * 4 - 2).toFixed(1)]);
        }
        const spikes = Array.from({ length: Math.floor(next() * spikiness) }, () => ({
          t: Math.floor(start + next() * (end - start)),
          peakDb: +(loudness + 12 + next() * 10).toFixed(1),
        })).sort((a, b) => a.t - b.t);
        const startedAt = offsetIso(start);
        const document: NightDocument = nightDocument.parse({
          nightId: uuid(next),
          userId,
          night: nightOf(new Date(startedAt)),
          startedAt,
          endedAt: offsetIso(end),
          baselineDb: +loudness.toFixed(1),
          location: home,
          consent: { microphone: true, health: false, location: true },
          events: eventsFromSpikes(spikes),
          wakeUps: [],
          attribution: null,
          evidence: { hash: null, memoSignature: null },
        });
        writes.push({ document, noise, stages: [], vitals: null });
      }
    }
  }
  return writes;
}

export type SeedTally = {
  users: number;
  nights: number;
  noiseRows: number;
  /** Simulated nights removed first, so a change of placement leaves nothing behind */
  replaced: number;
};

/** Replaces the whole simulated cohort: removes every simulated night, then writes the new set. */
export async function seedSimulatedNights(
  store: SimulatedNightStore,
  areas: readonly SimulatedArea[],
  options: SeedOptions,
): Promise<SeedTally> {
  const writes = buildSimulatedNights(areas, options);
  const replaced = (await store.removeAll()).nights;
  for (const write of writes) await store.save(write);
  return {
    users: new Set(writes.map((w) => w.document.userId)).size,
    nights: writes.length,
    noiseRows: writes.reduce((sum, w) => sum + w.noise.length, 0),
    replaced,
  };
}

/** Removes every simulated night and nothing else: the off switch for everyone. */
export function removeSimulatedNights(store: SimulatedNightStore): Promise<NightDeleteCounts> {
  return store.removeAll();
}

/** `bun src/features/night/seed.ts seed|count|remove` */
if (import.meta.main) {
  const command = process.argv[2] ?? "seed";
  if (!["seed", "count", "remove"].includes(command)) {
    console.error("usage: bun src/features/night/seed.ts seed|count|remove");
    process.exit(1);
  }
  const { requireEnv } = await import("../../env");
  requireEnv("MONGO_URI");
  if (command !== "count") requireEnv("TIGER_URI");
  const { closeMongo, connectMongo } = await import("../../db/mongo");
  const { closeTiger, connectTiger } = await import("../../db/tiger");
  const { createSimulatedNightStore } = await import("./repo");
  await connectMongo();
  // seed and remove write noise rows to Tiger; both pools close at the end, so the run exits.
  if (command !== "count") await connectTiger();
  const store = createSimulatedNightStore();
  try {
    if (command === "seed") {
      const tally = await seedSimulatedNights(store, NEWCASTLE_AREAS, {
        ...DEFAULT_SEED,
        now: new Date(),
      });
      console.log(
        `simulated: replaced ${tally.replaced} nights with ${tally.nights} nights for ` +
          `${tally.users} people in ${NEWCASTLE_AREAS.length} areas, ${tally.noiseRows} noise rows`,
      );
    } else if (command === "count") {
      console.log(`simulated nights stored: ${await store.count()}`);
    } else {
      const gone = await removeSimulatedNights(store);
      console.log(`removed ${gone.nights} simulated nights, ${gone.noiseRows} noise rows`);
    }
  } finally {
    await closeMongo();
    await closeTiger();
  }
}
