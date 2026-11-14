import cron from "node-cron";
import { connectMongo } from "./db/mongo";
import { connectTiger } from "./db/tiger";
import { env } from "./env";
import { accountJobs } from "./features/account";
import { attributionJobs } from "./features/attribution";
import { briefingJobs } from "./features/briefing";
import { cityJobs } from "./features/city";
import { evidenceJobs } from "./features/evidence";
import { labelsJobs } from "./features/labels";
import { liveJobs } from "./features/live";
import { nightJobs } from "./features/night";
import { staysJobs } from "./features/stays";
import { worksJobs } from "./features/works";
import type { Job } from "./jobs";

// One entry per feature. Written in M0; feature work only edits its own `<feature>Jobs` list.
const jobs: Job[] = [
  ...cityJobs,
  ...nightJobs,
  ...attributionJobs,
  ...labelsJobs,
  ...briefingJobs,
  ...evidenceJobs,
  ...staysJobs,
  ...worksJobs,
  ...liveJobs,
  ...accountJobs,
];

const { MONGO_URI, TIGER_URI } = env();
if (TIGER_URI) await connectTiger();
if (MONGO_URI) await connectMongo();

for (const job of jobs) {
  cron.schedule(
    job.schedule,
    async () => {
      try {
        await job.run();
      } catch (error) {
        console.error(`job ${job.name} failed`, error);
      }
    },
    { name: job.name, noOverlap: true },
  );
}
console.log(`worker running ${jobs.length} jobs`);
