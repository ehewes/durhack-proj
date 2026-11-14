import { type WorkRecord, workRecord } from "@kip/shared/works";
import type { Db, Filter } from "mongodb";
import { mongo } from "../../db/mongo";

export type WorksWrite = "inserted" | "updated" | "kept";

/** Permit storage. Tests pass a memory repository; the API uses MongoDB `works`. */
export interface WorksRepository {
  upsert(work: WorkRecord): Promise<WorksWrite>;
  findNear(lon: number, lat: number, radiusM: number): Promise<WorkRecord[]>;
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
  if (work.geometry.type === "Point") {
    const [workLon, workLat] = work.geometry.coordinates;
    return Math.hypot(...localMetres(workLat, workLon, lat, lon));
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < work.geometry.coordinates.length - 1; i++) {
    const start = work.geometry.coordinates[i];
    const end = work.geometry.coordinates[i + 1];
    if (!start || !end) continue;
    best = Math.min(best, distanceToSegment(lat, lon, start, end));
  }
  return best;
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
        .map((hit) => workRecord.parse(hit.work));
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
      return docs.map((doc) => workRecord.parse(doc));
    },
  };
}
