import {
  type CoveragePoint,
  cityCoverage,
  citySensors,
  coverageFrom,
  coverageSince,
  type SensorLevel,
} from "@kip/shared/city";
import { publicProcedure, router } from "../../trpc/init";
import { nightLocations } from "../night";
import { createCityRepo } from "./repo";
import { listCitySensors } from "./service";

/** Thin: validate the shared schema, then read Mongo. */
export function createCityRouter(
  load?: () => Promise<SensorLevel[]>,
  locate: (since: string) => Promise<CoveragePoint[]> = nightLocations,
) {
  const read = load ?? (() => listCitySensors(createCityRepo()));
  return router({
    sensors: publicProcedure.query(async () => citySensors.parse(await read())),
    /** Where Kip phones and Watches sensed, as rough cells. Exact locations never leave here. */
    coverage: publicProcedure.query(async () =>
      cityCoverage.parse(coverageFrom(await locate(coverageSince(new Date())))),
    ),
  });
}

export const cityRouter = createCityRouter();
