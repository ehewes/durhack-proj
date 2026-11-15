import { describe, expect, test } from "bun:test";
import type { NightDeleteCounts, NightWrite, SimulatedNightStore } from "./repo";
import {
  buildSimulatedNights,
  DEFAULT_SEED,
  NEWCASTLE_AREAS,
  removeSimulatedNights,
  type SimulatedArea,
  seedSimulatedNights,
} from "./seed";

const NOW = new Date("2026-11-15T12:00:00Z");
const OPTIONS = { ...DEFAULT_SEED, now: NOW };
const AREAS: SimulatedArea[] = [
  { name: "Centre", lat: 54.9746, lon: -1.6132, radiusM: 300, people: 3, lively: 1 },
  { name: "Suburb", lat: 54.983, lon: -1.655, radiusM: 500, people: 3, lively: 0 },
];
const PEOPLE = 6;

/** Metres between two points, flat-earth, fine at city scale. */
function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((b.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

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
    expect(buildSimulatedNights(AREAS, OPTIONS)).toEqual(buildSimulatedNights(AREAS, OPTIONS));
  });

  test("hold no health series, and each person sleeps at one home inside their area", () => {
    const writes = buildSimulatedNights(AREAS, OPTIONS);
    expect(writes).toHaveLength(PEOPLE * OPTIONS.nightsPerUser);
    const homes = new Map<string, string>();
    for (const write of writes) {
      expect(write.vitals).toBeNull();
      expect(write.stages).toEqual([]);
      expect(write.document.consent).toEqual({ microphone: true, health: false, location: true });
      const home = write.document.location ?? { lat: 0, lon: 0 };
      expect(AREAS.some((area) => metres(home, area) <= area.radiusM + 1)).toBe(true);
      const key = `${home.lat},${home.lon}`;
      expect(homes.get(write.document.userId) ?? key).toBe(key);
      homes.set(write.document.userId, key);
    }
    expect(homes.size).toBe(PEOPLE);
  });

  test("every night is over before now, with each person's own bedtime and waking", () => {
    const morning = new Date("2026-11-15T07:30:00Z");
    for (const now of [NOW, morning]) {
      const writes = buildSimulatedNights(AREAS, { ...OPTIONS, now });
      for (const write of writes) {
        expect(Date.parse(write.document.endedAt) < now.getTime()).toBe(true);
        const hours =
          (Date.parse(write.document.endedAt) - Date.parse(write.document.startedAt)) / 3_600_000;
        expect(hours > 4 && hours < 11).toBe(true);
      }
      const nights = new Set(writes.map((w) => `${w.document.userId} ${w.document.night}`));
      expect(nights.size).toBe(writes.length);
    }
    const starts = new Set(buildSimulatedNights(AREAS, OPTIONS).map((w) => w.document.startedAt));
    expect(starts.size > PEOPLE).toBe(true);
  });

  test("livelier areas have louder nights", () => {
    const writes = buildSimulatedNights(AREAS, OPTIONS);
    const mean = (name: string) => {
      const area = AREAS.find((a) => a.name === name) as SimulatedArea;
      const own = writes.filter(
        (w) => metres(w.document.location ?? area, area) <= area.radiusM + 1,
      );
      return own.reduce((sum, w) => sum + w.document.baselineDb, 0) / own.length;
    };
    expect(mean("Centre") > mean("Suburb")).toBe(true);
  });

  test("the Newcastle areas sit within 5 km of Grey's Monument", () => {
    const monument = { lat: 54.9746, lon: -1.6132 };
    for (const area of NEWCASTLE_AREAS) {
      expect(metres(area, monument) + area.radiusM < 5000).toBe(true);
      expect(area.people > 0 && area.lively >= 0 && area.lively <= 1).toBe(true);
    }
    expect(NEWCASTLE_AREAS.reduce((sum, a) => sum + a.people, 0)).toBe(91);
  });

  test("seeding replaces the cohort, so a new placement leaves no old nights", async () => {
    const { store, rows } = memoryStore();
    const first = await seedSimulatedNights(store, AREAS, OPTIONS);
    expect(first).toMatchObject({ users: PEOPLE, nights: 30, replaced: 0 });
    const again = await seedSimulatedNights(store, AREAS, OPTIONS);
    expect(again.replaced).toBe(30);
    expect(rows.size).toBe(30);
    const moved = await seedSimulatedNights(store, AREAS.slice(0, 1), OPTIONS);
    expect(moved).toMatchObject({ nights: 15, replaced: 30 });
    expect(await store.count()).toBe(15);
    expect((await store.list()).every((n) => n.simulated)).toBe(true);
  });

  test("seeding no areas stores nothing", async () => {
    const { store, rows } = memoryStore();
    expect((await seedSimulatedNights(store, [], OPTIONS)).nights).toBe(0);
    expect(rows.size).toBe(0);
  });

  test("one removal turns them all off", async () => {
    const { store } = memoryStore();
    await seedSimulatedNights(store, AREAS, OPTIONS);
    const gone = await removeSimulatedNights(store);
    expect(gone.nights).toBe(30);
    expect(await store.count()).toBe(0);
  });
});
