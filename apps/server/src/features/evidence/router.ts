import {
  anchorInput,
  anchorOutput,
  reportInput,
  reportOutput,
  verifyInput,
  verifyOutput,
} from "@kip/shared/evidence";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router, userProcedure } from "../../trpc/init";
import { NightNotFoundError, NightStorageError } from "../night";
import { EvidenceChainError } from "./errors";
import { loadLive } from "./load";
import type { EvidenceService } from "./service";

function mapEvidenceError(error: unknown): never {
  if (error instanceof NightNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof EvidenceChainError) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: error.message });
  }
  if (error instanceof NightStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

export function createEvidenceRouter(svc?: EvidenceService) {
  const service = async () => svc ?? (await loadLive()).liveEvidence;
  return router({
    anchor: userProcedure.input(anchorInput).mutation(async ({ ctx, input }) => {
      try {
        return anchorOutput.parse(await (await service()).anchor(ctx.userId, input.nightId));
      } catch (error) {
        mapEvidenceError(error);
      }
    }),
    verify: publicProcedure.input(verifyInput).query(async ({ input }) => {
      try {
        return verifyOutput.parse(await (await service()).verify(input.nightId));
      } catch (error) {
        mapEvidenceError(error);
      }
    }),
    report: userProcedure.input(reportInput).query(async ({ ctx, input }) => {
      try {
        return reportOutput.parse(await (await service()).report(ctx.userId, input.nightId));
      } catch (error) {
        mapEvidenceError(error);
      }
    }),
  });
}

export const evidenceRouter = createEvidenceRouter();
