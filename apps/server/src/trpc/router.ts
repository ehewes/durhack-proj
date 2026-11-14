import { accountRouter } from "../features/account";
import { attributionRouter } from "../features/attribution";
import { briefingRouter } from "../features/briefing";
import { cityRouter } from "../features/city";
import { evidenceRouter } from "../features/evidence";
import { labelsRouter } from "../features/labels";
import { liveRouter } from "../features/live";
import { nightRouter } from "../features/night";
import { staysRouter } from "../features/stays";
import { worksRouter } from "../features/works";
import { router } from "./init";

// One line per feature. Written in M0; feature work never edits this file.
export const appRouter = router({
  city: cityRouter,
  night: nightRouter,
  attribution: attributionRouter,
  labels: labelsRouter,
  briefing: briefingRouter,
  evidence: evidenceRouter,
  stays: staysRouter,
  works: worksRouter,
  live: liveRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;
