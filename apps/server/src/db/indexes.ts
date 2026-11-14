import type { Db, IndexSpecification } from "mongodb";

/** Collections and their indexes (docs/ARCHITECTURE.md, "MongoDB Atlas"). */
export const INDEXES: Record<string, IndexSpecification[]> = {
  users: [],
  nights: [{ userId: 1, startedAt: -1 }],
  sensors: [{ location: "2dsphere" }],
  hotels: [{ location: "2dsphere" }],
  venues: [{ location: "2dsphere" }],
  works: [{ geometry: "2dsphere" }],
};

/** Creates every collection, then its indexes. Safe to run on every boot. */
export async function ensureIndexes(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const [collection, specs] of Object.entries(INDEXES)) {
    if (!existing.has(collection)) await db.createCollection(collection);
    for (const spec of specs) await db.collection(collection).createIndex(spec);
  }
}

if (import.meta.main) {
  const { closeMongo, connectMongo, mongo } = await import("./mongo");
  await connectMongo();
  await ensureIndexes(mongo());
  console.log(`indexes ensured on ${Object.keys(INDEXES).length} collections`);
  await closeMongo();
}
