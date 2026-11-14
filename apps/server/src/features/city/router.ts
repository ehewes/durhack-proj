import { citySensors, type SensorLevel } from "@kip/shared/city";
import { publicProcedure, router } from "../../trpc/init";
import { createCityRepo } from "./repo";
import { listCitySensors } from "./service";

/** Thin: validate the shared schema, then read Mongo. */
export function createCityRouter(load?: () => Promise<SensorLevel[]>) {
  const read = load ?? (() => listCitySensors(createCityRepo()));
  return router({
    sensors: publicProcedure.query(async () => citySensors.parse(await read())),
  });
}

export const cityRouter = createCityRouter();
