import sample from "../../integrations/fixtures/street-manager/newcastle-permits.json";
import { parsePermitNotification } from "../../integrations/street-manager";
import demo from "./fixtures/demo-night-works.json";
import type { WorksWrite } from "./repo";
import { storePermit } from "./service";

export type SeedTally = Record<WorksWrite, number> & {
  outsideNewcastle: number;
  nightWork: number;
};

/** Street Manager permit events, in load order: the Newcastle sample, then the demo night works. */
export function samplePermitEvents(): readonly unknown[] {
  return [...sample.permits, ...demo.permits];
}

/**
 * `bun run seed:works`. Loads the Newcastle permit sample through `storePermit`, the step a
 * live SNS permit takes, so the works penalty has permits before the feed is live. The
 * sample has no night work on the Quiet Stays demo stay, so `fixtures/demo-night-works.json`
 * adds one permit outside the demo hotel for those nights. Both are simulated, so every
 * permit is stored with `simulated: true`. Safe to run again: permits upsert on their reference.
 */
export async function seedWorks(): Promise<SeedTally> {
  const tally: SeedTally = { inserted: 0, updated: 0, kept: 0, outsideNewcastle: 0, nightWork: 0 };
  for (const event of samplePermitEvents()) {
    const result = await storePermit(parsePermitNotification(event), { simulated: true });
    if (!result.stored) {
      tally.outsideNewcastle += 1;
      continue;
    }
    tally[result.write] += 1;
    if (result.nightWork) tally.nightWork += 1;
  }
  return tally;
}

if (import.meta.main) {
  const { requireEnv } = await import("../../env");
  // A missing key fails here at once, not after connectMongo's retries.
  requireEnv("MONGO_URI");
  const { closeMongo, connectMongo } = await import("../../db/mongo");
  await connectMongo();
  try {
    const tally = await seedWorks();
    console.log(
      `works sample stored as simulated: ${tally.inserted} inserted, ${tally.updated} updated, ` +
        `${tally.kept} kept, ${tally.outsideNewcastle} outside Newcastle. ` +
        `${tally.nightWork} have night work scheduled.`,
    );
  } finally {
    await closeMongo();
  }
}
