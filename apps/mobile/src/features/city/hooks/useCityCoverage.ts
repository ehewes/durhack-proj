import type { CityCoverage } from "@kip/shared/city";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/** Rough cells where Kip phones and Watches sensed. Null until loaded, or when unreachable. */
export function useCityCoverage(): CityCoverage | null {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.city.coverage.queryOptions(), retry: 1, staleTime: 5 * 60_000 });
  return (query.data as CityCoverage | undefined) ?? null;
}
