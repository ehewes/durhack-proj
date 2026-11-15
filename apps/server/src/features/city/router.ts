import type { AccountView } from "@kip/shared/account";
import {
  type CityCoverage,
  type CoveragePoint,
  cityCoverage,
  citySensors,
  type SensorLevel,
} from "@kip/shared/city";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../../trpc/init";
import { AccountStorageError, getAccount } from "../account";
import { NightStorageError, nightLocations } from "../night";
import { createCityRepo } from "./repo";
import { computeCoverage, listCitySensors } from "./service";

/** How long one computed coverage is reused in this process: the query is public and hot. */
export const COVERAGE_CACHE_MS = 5 * 60_000;

function mapCityError(error: unknown): never {
  if (error instanceof NightStorageError || error instanceof AccountStorageError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  throw error;
}

/** Thin: validate the shared schema, then read Mongo. */
export function createCityRouter(
  load?: () => Promise<SensorLevel[]>,
  locate: (since: string) => Promise<CoveragePoint[]> = nightLocations,
  accountOf: (userId: string) => Promise<AccountView> = getAccount,
) {
  const read = load ?? (() => listCitySensors(createCityRepo()));
  // Per router, so each test router starts empty. A consent change shows within this window.
  let cached: { at: number; coverage: CityCoverage } | undefined;
  return router({
    sensors: publicProcedure.query(async () => citySensors.parse(await read())),
    /** Where Kip phones and Watches sensed, as rough cells. Exact locations never leave here. */
    coverage: publicProcedure.query(async () => {
      const now = Date.now();
      if (cached && now - cached.at < COVERAGE_CACHE_MS) return cached.coverage;
      try {
        const coverage = cityCoverage.parse(
          await computeCoverage({ locate, accountOf, now: new Date(now) }),
        );
        cached = { at: now, coverage };
        return coverage;
      } catch (error) {
        mapCityError(error);
      }
    }),
  });
}

export const cityRouter = createCityRouter();
