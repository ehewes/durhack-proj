import { type StoredWork, storedWork, type WorkRecord, workRecord } from "@kip/shared/works";
import type { Db, Filter } from "mongodb";
import { mongo } from "../../db/mongo";

export type WorksWrite = "inserted" | "updated" | "kept";

/** Permit storage. Tests pass a memory repository; the API uses MongoDB `works`. */
export interface WorksRepository {
  upsert(work: WorkRecord): Promise<WorksWrite>;
  findNear(lon: number, lat: number, radiusM: number): Promise<StoredWork[]>;
}

const METRES_PER_DEGREE_LAT = 110_540;

function localMetres(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): [number, number] {
  const metresPerDegreeLon = 111_320 * Math.cos((originLat * Math.PI) / 180);
  return [(lon - originLon) * metresPerDegreeLon, (lat - originLat) * METRES_PER_DEGREE_LAT];
}

function distanceToSegment(
  lat: number,
  lon: number,
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const [ax, ay] = localMetres(start[1], start[0], lat, lon);
  const [bx, by] = localMetres(end[1], end[0], lat, lon);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Metres from a WGS84 point to a stored geometry. A line uses the closest point on it. */
export function distanceToWork(lat: number, lon: number, work: WorkRecord): number {
  const geometry = work.geometry;
  if (geometry.type === "Point") {
    const [workLon, workLat] = geometry.coordinates;
    return Math.hypot(...localMetres(workLat, workLon, lat, lon));
  }
  if (geometry.type === "Polygon" && insideRing(lat, lon, geometry.coordinates[0])) return 0;
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  let best = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const start = line[i];
      const end = line[i + 1];
      if (!start || !end) continue;
      best = Math.min(best, distanceToSegment(lat, lon, start, end));
    }
  }
  return best;
}

function insideRing(
  lat: number,
  lon: number,
  ring: ReadonlyArray<readonly [number, number]> | undefined,
): boolean {
  if (!ring) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > lat !== b[1] > lat && lon < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** In-memory permits for tests. Same upsert and distance rules as the MongoDB repository. */
export function memoryWorksRepository(): WorksRepository & { all(): WorkRecord[] } {
  const rows: WorkRecord[] = [];
  return {
    all: () => rows.map((work) => workRecord.parse(work)),
    async upsert(work) {
      const index = rows.findIndex(
        (row) => row.permitReferenceNumber === work.permitReferenceNumber,
      );
      if (index < 0) {
        rows.push(work);
        return "inserted";
      }
      const existing = rows[index];
      if (existing && existing.eventTime > work.eventTime) return "kept";
      rows[index] = work;
      return "updated";
    },
    async findNear(lon, lat, radiusM) {
      return rows
        .map((work) => ({ work, distance: distanceToWork(lat, lon, work) }))
        .filter((hit) => hit.distance <= radiusM)
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            a.work.permitReferenceNumber.localeCompare(b.work.permitReferenceNumber),
        )
        .map((hit) => storedWork.parse(hit.work));
    },
  };
}

let current: WorksRepository | undefined;

export function worksRepository(): WorksRepository {
  current ??= createMongoWorksRepository(mongo());
  return current;
}

/** Tests inject a repository. `undefined` restores the MongoDB default on the next use. */
export function setWorksRepository(repository: WorksRepository | undefined): void {
  current = repository;
}

/**
 * MongoDB `works`. A newer `eventTime` replaces the permit; an older redelivery is kept.
 * `findNear` uses the `2dsphere` index on `geometry` (`$near`, metres).
 */
export function createMongoWorksRepository(db: Db): WorksRepository {
  const works = () => db.collection<WorkRecord>("works");
  return {
    async upsert(work) {
      const existing = await works().findOne({
        permitReferenceNumber: work.permitReferenceNumber,
      });
      if (existing && existing.eventTime > work.eventTime) return "kept";
      await works().replaceOne({ permitReferenceNumber: work.permitReferenceNumber }, work, {
        upsert: true,
      });
      return existing ? "updated" : "inserted";
    },
    async findNear(lon, lat, radiusM) {
      const filter = {
        geometry: {
          $near: {
            $geometry: { type: "Point", coordinates: [lon, lat] },
            $maxDistance: radiusM,
          },
        },
      } as Filter<WorkRecord>;
      const docs = await works().find(filter).toArray();
      return docs.map((doc) => storedWork.parse(doc));
    },
  };
}
