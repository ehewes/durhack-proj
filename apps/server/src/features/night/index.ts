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
export type { NightLocation } from "./repo";
/** Night locations for the city coverage map: read-only, nights with location consent only. */
export { readNightLocations as nightLocations } from "./repo";
export type { NightDeleteCounts, NightRecord, NightVitals } from "./service";
export {
  addEventLabels,
  deleteUserNights,
  getNight,
  setAttribution,
  setEvidence,
} from "./service";
