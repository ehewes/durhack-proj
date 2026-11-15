import { nightOf } from "@kip/shared/domain";
import { eventsFromSpikes, type NightDocument, nightDocument } from "@kip/shared/night";
import type { NightDeleteCounts, NightWrite, Sample, SimulatedNightStore } from "./repo";

/** A point near which simulated nights are placed: a sensor or a hotel. */
export type Anchor = { kind: "sensor" | "hotel"; lat: number; lon: number };

export type SeedOptions = {
  users: number;
  nightsPerUser: number;
  /** The newest night is the one before this instant's date. */
  now: Date;
};

export const DEFAULT_SEED: Omit<SeedOptions, "now"> = { users: 12, nightsPerUser: 5 };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Metres of scatter around an anchor, so nights sit near a sensor or hotel, not on it. */
const SCATTER_M = 150;
const M_PER_DEG_LAT = 111_320;

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

function scatter(anchor: Anchor, next: () => number): { lat: number; lon: number } {
  const dLat = ((next() * 2 - 1) * SCATTER_M) / M_PER_DEG_LAT;
  const dLon =
    ((next() * 2 - 1) * SCATTER_M) / (M_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180));
  return { lat: +(anchor.lat + dLat).toFixed(6), lon: +(anchor.lon + dLon).toFixed(6) };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function offsetIso(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/**
 * Deterministic made-up nights: relative dB only, microphone and location consent, no health
 * series. They are meant for the simulated store, which flags each one `simulated: true`.
 */
export function buildSimulatedNights(
  anchors: readonly Anchor[],
  options: SeedOptions,
): NightWrite[] {
  if (anchors.length === 0) return [];
  const writes: NightWrite[] = [];
  const newest = Date.parse(`${isoDate(options.now.getTime())}T00:00:00Z`) - DAY_MS;
  for (let u = 0; u < options.users; u += 1) {
    const next = prng(1000 + u);
    const userId = uuid(next);
    const anchor = anchors[u % anchors.length] as Anchor;
    const loudness = 3 + next() * 9;
    const home = scatter(anchor, next);
    for (let n = 0; n < options.nightsPerUser; n += 1) {
      const day = newest - n * DAY_MS;
      const start = Date.parse(`${isoDate(day)}T23:30:00Z`) / 1000;
      const end = Date.parse(`${isoDate(day + DAY_MS)}T07:00:00Z`) / 1000;
      const noise: Sample[] = [];
      for (let t = start; t < end; t += 60) {
        noise.push([t, +(loudness + next() * 4 - 2).toFixed(1)]);
      }
      const spikes = Array.from({ length: Math.floor(next() * 4) }, () => ({
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
  return writes;
}

export type SeedTally = { users: number; nights: number; noiseRows: number };

/** Safe to run again: ids repeat for the same options, so each write replaces its earlier copy. */
export async function seedSimulatedNights(
  store: SimulatedNightStore,
  anchors: readonly Anchor[],
  options: SeedOptions,
): Promise<SeedTally> {
  const writes = buildSimulatedNights(anchors, options);
  for (const write of writes) await store.save(write);
  return {
    users: new Set(writes.map((w) => w.document.userId)).size,
    nights: writes.length,
    noiseRows: writes.reduce((sum, w) => sum + w.noise.length, 0),
  };
}

/** Removes every simulated night and nothing else. */
export function removeSimulatedNights(store: SimulatedNightStore): Promise<NightDeleteCounts> {
  return store.removeAll();
}

type GeoDoc = { location?: { coordinates?: [number, number] } };

/** Sensor and hotel points, read straight from their collections (read-only). */
export async function loadAnchors(): Promise<Anchor[]> {
  const { mongo } = await import("../../db/mongo");
  const anchors: Anchor[] = [];
  for (const [collection, kind] of [
    ["sensors", "sensor"],
    ["hotels", "hotel"],
  ] as const) {
    const docs = await mongo()
      .collection<GeoDoc>(collection)
      .find({}, { projection: { location: 1 } })
      .sort({ _id: 1 })
      .toArray();
    for (const doc of docs) {
      const point = doc.location?.coordinates;
      if (point) anchors.push({ kind, lon: point[0], lat: point[1] });
    }
  }
  return anchors;
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
  const { createSimulatedNightStore } = await import("./repo");
  await connectMongo();
  const store = createSimulatedNightStore();
  try {
    if (command === "seed") {
      const anchors = await loadAnchors();
      if (anchors.length === 0) {
        console.error("No sensors or hotels stored yet. Load them first, then seed.");
        process.exit(1);
      }
      const tally = await seedSimulatedNights(store, anchors, { ...DEFAULT_SEED, now: new Date() });
      console.log(
        `simulated: ${tally.nights} nights for ${tally.users} users near ${anchors.length} ` +
          `sensors and hotels, ${tally.noiseRows} noise rows`,
      );
    } else if (command === "count") {
      console.log(`simulated nights stored: ${await store.count()}`);
    } else {
      const gone = await removeSimulatedNights(store);
      console.log(`removed ${gone.nights} simulated nights, ${gone.noiseRows} noise rows`);
    }
  } finally {
    await closeMongo();
  }
}
