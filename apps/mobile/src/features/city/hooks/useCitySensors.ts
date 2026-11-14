import type { CitySensors } from "@kip/shared/city";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { fixtureSensors } from "../data/fixture";

export type SensorsState =
  | { kind: "loading" }
  | { kind: "sensors"; sensors: CitySensors; simulated: boolean };

/** Server sensors, or the shared fixture labelled simulated when the API cannot be reached. */
export function useCitySensors(): SensorsState {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.city.sensors.queryOptions(), retry: 1 });
  if (query.data) return { kind: "sensors", sensors: query.data as CitySensors, simulated: false };
  if (query.isPending) return { kind: "loading" };
  return { kind: "sensors", sensors: fixtureSensors, simulated: true };
}
