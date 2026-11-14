import { overlapsDates, type WorksNearInput, type WorksNearResult } from "@kip/shared/works";
import { TRPCError } from "@trpc/server";
import { worksRepository } from "./repo";

/** Permits near a point whose active dates overlap the inclusive range. */
export async function worksNear(input: WorksNearInput): Promise<WorksNearResult> {
  if (input.from > input.to) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "from is after to" });
  }
  const found = await worksRepository().findNear(input.lon, input.lat, input.radiusM);
  return { works: found.filter((work) => overlapsDates(work, input.from, input.to)) };
}
