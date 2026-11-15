import { type CitySensors, citySensors } from "@kip/shared/city";
import fixture from "../../../../../../packages/shared/src/city/fixtures/city-sensors.json";

/** Offline fallback for `city.sensors`: the shared sample, shown labelled as simulated. */
export const fixtureSensors: CitySensors = citySensors.parse(fixture);
