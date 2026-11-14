import { briefingGetInput, briefingGetOutput } from "@kip/shared/briefing";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "../../trpc/init";
import { NightNotFoundError, NightStorageError } from "../night";
import { loadFeatureModule } from "./load";
import { BriefingAudioError, BriefingNotFoundError, type BriefingService } from "./service";

export async function getBriefing(userId: string, nightId: string) {
  const live = await loadFeatureModule<{ getBriefing: BriefingService["get"] }>("./live");
  return live.getBriefing(userId, nightId);
}

function mapBriefingError(error: unknown): never {
  if (error instanceof BriefingNotFoundError || error instanceof NightNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Night not found" });
  }
  if (error instanceof NightStorageError || error instanceof BriefingAudioError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

export function createBriefingRouter(svc: Pick<BriefingService, "get"> = { get: getBriefing }) {
  return router({
    get: userProcedure.input(briefingGetInput).query(async ({ ctx, input }) => {
      try {
        return briefingGetOutput.parse(await svc.get(ctx.userId, input.nightId));
      } catch (error) {
        mapBriefingError(error);
      }
    }),
  });
}

export const briefingRouter = createBriefingRouter();
