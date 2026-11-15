import type { RankInput, RankResult } from "@kip/shared/stays";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { rankSamples } from "../data/fixture";
import { sampleRank } from "../model";

export type RankState =
  | { kind: "loading" }
  | { kind: "ranked"; result: RankResult; sample: boolean; leavesOutStation: boolean };

/** `stays.rank` for the input, or the shared sample labelled simulated when the API cannot be reached. */
export function useRank(input: RankInput): RankState {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.stays.rank.queryOptions(input), retry: 1 });
  if (query.data) {
    return {
      kind: "ranked",
      result: query.data as RankResult,
      sample: false,
      leavesOutStation: false,
    };
  }
  if (query.isPending) return { kind: "loading" };
  const { result, leavesOutStation } = sampleRank(input, rankSamples);
  return { kind: "ranked", result, sample: true, leavesOutStation };
}
