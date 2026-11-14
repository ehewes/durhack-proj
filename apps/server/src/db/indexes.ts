import type { IndexSpecification } from "mongodb";
import { mongo } from "./mongo";

/** Collections and their indexes (docs/ARCHITECTURE.md, "MongoDB Atlas"). */
export const INDEXES: Record<string, IndexSpecification[]> = {
  users: [],
  nights: [{ userId: 1, startedAt: -1 }],
  sensors: [{ location: "2dsphere" }],
  hotels: [{ location: "2dsphere" }],
  venues: [{ location: "2dsphere" }],
  works: [{ geometry: "2dsphere" }],
};

export async function ensureIndexes(): Promise<void> {
  for (const [collection, specs] of Object.entries(INDEXES)) {
    for (const spec of specs) await mongo().collection(collection).createIndex(spec);
  }
}
