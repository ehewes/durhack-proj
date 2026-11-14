import type { WorksNearInput, WorksNearResult } from "@kip/shared/works";
import { loadFeatureModule } from "./load";

/** `works.near`. Loaded at call time so the app's typecheck never sees MongoDB. */
export async function worksNear(input: WorksNearInput): Promise<WorksNearResult> {
  const query = await loadFeatureModule<{
    worksNear: (input: WorksNearInput) => Promise<WorksNearResult>;
  }>("./query");
  return query.worksNear(input);
}
