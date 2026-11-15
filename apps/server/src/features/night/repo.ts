import type { NightDocument, NightUpload } from "@kip/shared/night";
import type { Collection } from "mongodb";
import { PostgresError } from "postgres";
import { mongo } from "../../db/mongo";
import { tiger } from "../../db/tiger";
import { NightNotFoundError, NightStorageError } from "./errors";

type SleepStage = NonNullable<NightUpload["sleep"]>["stages"][number]["stage"];
type VitalMetric = "hr" | "hrv" | "resp";

export type StageRow = { start: string; end: string; stage: SleepStage };

/** Epoch seconds and value. Heart-rate series are health data: never log them. */
export type Sample = readonly [number, number];

export type NightVitals = {
  heartRate: Sample[];
  hrv: Sample[];
  respiratoryRate: Sample[];
};

export type NightSeries = {
  noise: Sample[];
  stages: StageRow[];
  vitals: NightVitals | null;
};

export type NightWrite = {
  document: NightDocument;
  noise: readonly Sample[];
  stages: readonly StageRow[];
  vitals: NightVitals | null;
};

export type NightDeleteCounts = {
  nights: number;
  noiseRows: number;
  vitalRows: number;
  stageRows: number;
};

export type NightRepo = {
  save(write: NightWrite): Promise<void>;
  getDocument(nightId: string): Promise<NightDocument | null>;
  readSeries(nightId: string): Promise<NightSeries>;
  listDocuments(userId: string): Promise<NightDocument[]>;
  updateDocument(document: NightDocument): Promise<void>;
  deleteUser(userId: string): Promise<NightDeleteCounts>;
};

const INSERT_CHUNK = 2000;

type NoiseRow = { time: Date; night_id: string; db: number };
type VitalRow = { time: Date; night_id: string; metric: VitalMetric; value: number };
type StageInsert = { night_id: string; start: Date; end: Date; stage: SleepStage };

function nights(): Collection<NightDocument & { _id: string }> {
  return mongo().collection("nights");
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function at(epochSec: number): Date {
  return new Date(epochSec * 1000);
}

/** Timestamptz comes back as UTC. The instant is unchanged. */
export function isoOffset(time: Date): string {
  return time.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

export function epochSeconds(time: Date): number {
  return Math.round(time.getTime() / 1000);
}

function noiseRows(nightId: string, samples: readonly Sample[]): NoiseRow[] {
  const byTime = new Map<number, NoiseRow>();
  for (const [t, db] of samples) {
    const prev = byTime.get(t);
    if (!prev || db > prev.db) byTime.set(t, { time: at(t), night_id: nightId, db });
  }
  return [...byTime.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
}

function vitalRows(nightId: string, vitals: NightVitals): VitalRow[] {
  const rows: VitalRow[] = [];
  const push = (metric: VitalMetric, samples: readonly Sample[]) => {
    const byTime = new Map<number, number>();
    for (const [t, value] of samples) byTime.set(t, value);
    for (const [t, value] of byTime) rows.push({ time: at(t), night_id: nightId, metric, value });
  };
  push("hr", vitals.heartRate);
  push("hrv", vitals.hrv);
  push("resp", vitals.respiratoryRate);
  return rows.sort(
    (a, b) => a.time.getTime() - b.time.getTime() || a.metric.localeCompare(b.metric),
  );
}

function stageRows(nightId: string, stages: readonly StageRow[]): StageInsert[] {
  return stages.map((stage) => ({
    night_id: nightId,
    start: new Date(stage.start),
    end: new Date(stage.end),
    stage: stage.stage,
  }));
}

/** Marks a night as made-up. The shared schema has no such field, so only the stored copy has it. */
type SimulatedFlag = { simulated: true };

function stored(
  document: NightDocument,
  flag?: SimulatedFlag,
): NightDocument & { _id: string } & Partial<SimulatedFlag> {
  return { ...document, ...flag, _id: document.nightId };
}

function documentOf(raw: NightDocument): NightDocument {
  return {
    nightId: raw.nightId,
    userId: raw.userId,
    night: raw.night,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    baselineDb: raw.baselineDb,
    location: raw.location,
    consent: raw.consent,
    events: raw.events,
    wakeUps: raw.wakeUps,
    attribution: raw.attribution,
    evidence: raw.evidence,
  };
}

function storageError(action: "read" | "write", error: unknown): NightStorageError {
  const code = error instanceof PostgresError && error.code ? ` (${error.code})` : "";
  const verb = action === "read" ? "read" : "store";
  return new NightStorageError(`Could not ${verb} the night${code}`);
}

async function guard<T>(action: "read" | "write", run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NightNotFoundError || error instanceof NightStorageError) throw error;
    throw storageError(action, error);
  }
}

async function save(write: NightWrite, flag?: SimulatedFlag): Promise<void> {
  const nightId = write.document.nightId;
  const sql = tiger();
  await sql.begin(async (tx) => {
    await tx`delete from night_noise where night_id = ${nightId}`;
    await tx`delete from sleep_stages where night_id = ${nightId}`;
    await tx`delete from vitals where night_id = ${nightId}`;
    for (const chunk of chunks(noiseRows(nightId, write.noise), INSERT_CHUNK)) {
      await tx`insert into night_noise ${tx(chunk, "time", "night_id", "db")}`;
    }
    const stages = stageRows(nightId, write.stages);
    if (stages.length > 0) {
      await tx`insert into sleep_stages ${tx(stages, "night_id", "start", "end", "stage")}`;
    }
    if (write.vitals) {
      for (const chunk of chunks(vitalRows(nightId, write.vitals), INSERT_CHUNK)) {
        await tx`insert into vitals ${tx(chunk, "time", "night_id", "metric", "value")}`;
      }
    }
  });
  await nights().replaceOne({ _id: nightId }, stored(write.document, flag), {
    upsert: true,
  });
}

async function readSeries(nightId: string): Promise<NightSeries> {
  const sql = tiger();
  const noise = await sql<{ time: Date; db: number }[]>`
    select time, db from night_noise where night_id = ${nightId} order by time
  `;
  const stages = await sql<{ start: Date; end: Date; stage: SleepStage }[]>`
    select start, "end", stage from sleep_stages where night_id = ${nightId} order by start
  `;
  const vitals = await sql<{ time: Date; metric: VitalMetric; value: number }[]>`
    select time, metric, value from vitals where night_id = ${nightId} order by time
  `;
  const pick = (metric: VitalMetric): Sample[] =>
    vitals
      .filter((row) => row.metric === metric)
      .map((row) => [epochSeconds(row.time), row.value] as Sample);
  const heartRate = pick("hr");
  const hrv = pick("hrv");
  const respiratoryRate = pick("resp");
  const anyVital = heartRate.length + hrv.length + respiratoryRate.length > 0;
  return {
    noise: noise.map((row) => [epochSeconds(row.time), row.db] as Sample),
    stages: stages.map((row) => ({
      start: isoOffset(row.start),
      end: isoOffset(row.end),
      stage: row.stage,
    })),
    vitals: anyVital ? { heartRate, hrv, respiratoryRate } : null,
  };
}

function affected(result: { count: number | null }): number {
  return result.count ?? 0;
}

async function deleteUser(userId: string): Promise<NightDeleteCounts> {
  const docs = await nights()
    .find({ userId, simulated: { $ne: true } })
    .toArray();
  const ids = docs.map((doc) => doc.nightId);
  if (ids.length === 0) return { nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 };
  const sql = tiger();
  const noise = await sql`delete from night_noise where night_id = any(${ids}::uuid[])`;
  const vital = await sql`delete from vitals where night_id = any(${ids}::uuid[])`;
  const stage = await sql`delete from sleep_stages where night_id = any(${ids}::uuid[])`;
  const deleted = await nights().deleteMany({ userId, simulated: { $ne: true } });
  return {
    nights: deleted.deletedCount,
    noiseRows: affected(noise),
    vitalRows: affected(vital),
    stageRows: affected(stage),
  };
}

/** Tiger + Mongo. Connecting waits until the first call, so imports stay side-effect free. */
/** Where a night was recorded, for the coverage map. Never leaves the server as is. */
export type NightLocation = { userId: string; lat: number; lon: number; simulated: boolean };

/**
 * Locations of nights from `since` (a London night date) on, real and simulated. Only nights
 * stored with location consent have one; the consent check here is a second guard.
 */
export function readNightLocations(since: string): Promise<NightLocation[]> {
  return guard("read", async () => {
    const rows = await nights()
      .find(
        { night: { $gte: since }, location: { $ne: null }, "consent.location": true },
        { projection: { userId: 1, location: 1, simulated: 1 } },
      )
      .toArray();
    return rows.flatMap((row): NightLocation[] => {
      const flagged = row as typeof row & Partial<SimulatedFlag>;
      if (!row.location) return [];
      return [
        {
          userId: row.userId,
          lat: row.location.lat,
          lon: row.location.lon,
          simulated: flagged.simulated === true,
        },
      ];
    });
  });
}

export function createNightRepo(): NightRepo {
  return {
    save: (write) => guard("write", () => save(write)),
    getDocument: (nightId) =>
      guard("read", async () => {
        const found = await nights().findOne({ _id: nightId, simulated: { $ne: true } });
        return found ? documentOf(found) : null;
      }),
    readSeries: (nightId) => guard("read", () => readSeries(nightId)),
    listDocuments: (userId) =>
      guard("read", async () =>
        (
          await nights()
            .find({ userId, simulated: { $ne: true } })
            .toArray()
        ).map(documentOf),
      ),
    updateDocument: (document) =>
      guard("write", async () => {
        const result = await nights().replaceOne({ _id: document.nightId }, stored(document));
        if (result.matchedCount === 0) throw new NightNotFoundError(document.nightId);
      }),
    deleteUser: (userId) => guard("write", () => deleteUser(userId)),
  };
}

export type SimulatedNight = { simulated: true; document: NightDocument };

/** Simulated nights live beside real ones in the same stores, told apart by `simulated: true`. */
export type SimulatedNightStore = {
  save(write: NightWrite): Promise<void>;
  count(): Promise<number>;
  /** The only read that returns simulated nights; each carries `simulated: true`. */
  list(): Promise<SimulatedNight[]>;
  /** Deletes only nights flagged simulated, in Mongo and Tiger. */
  removeAll(): Promise<NightDeleteCounts>;
};

async function removeSimulated(): Promise<NightDeleteCounts> {
  const docs = await nights()
    .find({ simulated: true }, { projection: { nightId: 1 } })
    .toArray();
  const ids = docs.map((doc) => doc.nightId);
  if (ids.length === 0) return { nights: 0, noiseRows: 0, vitalRows: 0, stageRows: 0 };
  const sql = tiger();
  const noise = await sql`delete from night_noise where night_id = any(${ids}::uuid[])`;
  const vital = await sql`delete from vitals where night_id = any(${ids}::uuid[])`;
  const stage = await sql`delete from sleep_stages where night_id = any(${ids}::uuid[])`;
  const deleted = await nights().deleteMany({ _id: { $in: ids }, simulated: true });
  return {
    nights: deleted.deletedCount,
    noiseRows: affected(noise),
    vitalRows: affected(vital),
    stageRows: affected(stage),
  };
}

export function createSimulatedNightStore(): SimulatedNightStore {
  return {
    save: (write) => guard("write", () => save(write, { simulated: true })),
    list: () =>
      guard("read", async () =>
        (await nights().find({ simulated: true }).toArray()).map((raw) => ({
          simulated: true as const,
          document: documentOf(raw),
        })),
      ),
    count: () => guard("read", () => nights().countDocuments({ simulated: true })),
    removeAll: () => guard("write", removeSimulated),
  };
}
