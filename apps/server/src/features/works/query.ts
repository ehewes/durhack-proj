import {
  overlapsDates,
  toWorksNearItem,
  type WorksNearInput,
  type WorksNearResult,
} from "@kip/shared/works";
import { TRPCError } from "@trpc/server";
import { worksRepository } from "./repo";

/**
 * Stored Street Manager permits near a point whose active dates overlap the inclusive range.
 * A permit with no usable geometry is counted in `omitted`, not drawn at a guessed point.
 */
export async function worksNear(input: WorksNearInput): Promise<WorksNearResult> {
  if (input.from > input.to) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "from is after to" });
  }
  const found = await worksRepository().findNear(input.lon, input.lat, input.radiusM);
  const result: WorksNearResult = {
    works: [],
    omitted: { absentGeometry: 0, malformedGeometry: 0 },
  };
  for (const work of found) {
    if (!overlapsDates(work, input.from, input.to)) continue;
    const shaped = toWorksNearItem(work);
    if (shaped.status === "ok") result.works.push(shaped.item);
    else if (shaped.status === "absent") result.omitted.absentGeometry += 1;
    else result.omitted.malformedGeometry += 1;
  }
  return result;
}
