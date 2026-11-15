import { useQuery } from "@tanstack/react-query";
import { useConsent } from "@/features/account";
import { watchSleep } from "../native/healthkit";
import { lastNight, type WatchNight } from "../native/watch-sleep";

export type WatchNightState = { status: "loading" } | (WatchNight & { retry: () => void });

/**
 * Last night's Apple Watch data from HealthKit. Waits for the account, so a read never starts
 * before Kip knows the user's health consent; without it the reader does not touch HealthKit.
 */
export function useWatchNight(): WatchNightState {
  const { consent, loading } = useConsent();
  const night = lastNight(new Date());
  const query = useQuery({
    queryKey: ["night", "watch", night, consent.health],
    queryFn: () => watchSleep.readNight(night, consent),
    enabled: !loading,
    staleTime: 10 * 60_000,
  });
  if (!query.data) return { status: "loading" };
  return { ...query.data, retry: () => void query.refetch() };
}
