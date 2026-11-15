import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConsent } from "@/features/account";
import { useTRPC } from "@/lib/trpc";
import { watchSleep } from "../native/healthkit";
import { healthConsentOf, lastNight, type WatchNight } from "../native/watch-sleep";

export type WatchNightState =
  | { status: "loading" }
  | (WatchNight & { night: string; retry: () => void });

/**
 * Last night's Apple Watch data from HealthKit. Waits for the account, and checks health consent
 * again from the cached account when each read starts, so a refetch after "delete everything"
 * never reads HealthKit with the consent that was on screen before.
 */
export function useWatchNight(): WatchNightState {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { consent, loading } = useConsent();
  const night = lastNight(new Date());
  const accountKey = trpc.account.me.queryKey();
  const query = useQuery({
    queryKey: ["night", "watch", night, consent.health],
    queryFn: () =>
      watchSleep.readNight(night, healthConsentOf(queryClient.getQueryData(accountKey))),
    enabled: !loading,
    staleTime: 10 * 60_000,
  });
  if (!query.data) return { status: "loading" };
  return { ...query.data, night, retry: () => void query.refetch() };
}
