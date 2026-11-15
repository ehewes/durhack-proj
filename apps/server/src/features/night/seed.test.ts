import { describe, expect, test } from "bun:test";
import type { NightDeleteCounts, NightWrite, SimulatedNightStore } from "./repo";
import {
  type Anchor,
  buildSimulatedNights,
  DEFAULT_SEED,
  removeSimulatedNights,
  seedSimulatedNights,
} from "./seed";

const NOW = new Date("2026-11-15T12:00:00Z");
const OPTIONS = { ...DEFAULT_SEED, now: NOW };
const ANCHORS: Anchor[] = [
  { kind: "sensor", lat: 54.9783, lon: -1.6178 },
  { kind: "hotel", lat: 54.9695, lon: -1.6064 },
  { kind: "sensor", lat: 54.9741, lon: -1.6132 },
];

/** Real and simulated nights in one map, as the Mongo collection holds them. */
function memoryStore() {
  const rows = new Map<string, { write: NightWrite; simulated: boolean }>();
  const store: SimulatedNightStore = {
    async save(write) {
      rows.set(write.document.nightId, { write: structuredClone(write), simulated: true });
    },
    async count() {
      return [...rows.values()].filter((r) => r.simulated).length;
    },
    async list() {
      return [...rows.values()]
        .filter((r) => r.simulated)
        .map((r) => ({ simulated: true as const, document: r.write.document }));
    },
    async removeAll(): Promise<NightDeleteCounts> {
      let noiseRows = 0;
      let nights = 0;
      for (const [id, r] of rows) {
        if (!r.simulated) continue;
        noiseRows += r.write.noise.length;
        nights += 1;
        rows.delete(id);
      }
      return { nights, noiseRows, vitalRows: 0, stageRows: 0 };
    },
  };
  return { store, rows };
}

describe("simulated nights", () => {
  test("are identical on every run", () => {
    expect(buildSimulatedNights(ANCHORS, OPTIONS)).toEqual(buildSimulatedNights(ANCHORS, OPTIONS));
  });

  test("hold no health series and stay within 150 m of an anchor", () => {
    const writes = buildSimulatedNights(ANCHORS, OPTIONS);
    expect(writes).toHaveLength(OPTIONS.users * OPTIONS.nightsPerUser);
    for (const write of writes) {
      expect(write.vitals).toBeNull();
      expect(write.stages).toEqual([]);
      expect(write.document.consent.health).toBe(false);
      const { lat, lon } = write.document.location ?? { lat: 0, lon: 0 };
      const near = ANCHORS.some((a) => {
        const dy = (lat - a.lat) * 111_320;
        const dx = (lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
        return Math.hypot(dx, dy) <= 160;
      });
      expect(near).toBe(true);
    }
  });

  test("seeding twice stores each night once, all flagged simulated", async () => {
    const { store, rows } = memoryStore();
    const first = await seedSimulatedNights(store, ANCHORS, OPTIONS);
    await seedSimulatedNights(store, ANCHORS, OPTIONS);
    expect(first.nights).toBe(60);
    expect(rows.size).toBe(60);
    expect(await store.count()).toBe(60);
    expect((await store.list()).every((n) => n.simulated)).toBe(true);
  });

  test("seed with no sensors or hotels stores nothing", async () => {
    const { store, rows } = memoryStore();
    expect((await seedSimulatedNights(store, [], OPTIONS)).nights).toBe(0);
    expect(rows.size).toBe(0);
  });

  test("one removal clears them all", async () => {
    const { store } = memoryStore();
    await seedSimulatedNights(store, ANCHORS, OPTIONS);
    const gone = await removeSimulatedNights(store);
    expect(gone.nights).toBe(60);
    expect(await store.count()).toBe(0);
  });
});
