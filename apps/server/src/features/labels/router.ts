import { labelsForNightInput, labelsForNightOutput } from "@kip/shared/labels";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "../../trpc/init";
import { NightNotFoundError, NightStorageError } from "../night";
import { loadLive } from "./load";
import type { LabelsService } from "./service";

function mapLabelsError(error: unknown): never {
  if (error instanceof NightNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof NightStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

export function createLabelsRouter(svc?: Pick<LabelsService, "forNight">) {
  return router({
    forNight: userProcedure.input(labelsForNightInput).query(async ({ ctx, input }) => {
      try {
        const service = svc ?? (await loadLive()).liveLabels;
        return labelsForNightOutput.parse(await service.forNight(ctx.userId, input.nightId));
      } catch (error) {
        mapLabelsError(error);
      }
    }),
  });
}

export const labelsRouter = createLabelsRouter();
