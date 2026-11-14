import type { Job } from "../../jobs";

export { nightRouter } from "./router";
export const nightJobs: Job[] = [];

export type { AttributionWrite, EventLabelPatch } from "@kip/shared/night";

export {
  NightConflictError,
  NightConsentError,
  NightEventNotFoundError,
  NightNotFoundError,
  NightStorageError,
} from "./errors";
export type { NightDeleteCounts, NightRecord, NightVitals } from "./service";
export {
  addEventLabels,
  deleteUserNights,
  getNight,
  setAttribution,
  setEvidence,
} from "./service";
