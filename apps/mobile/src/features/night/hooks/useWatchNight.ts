import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useConsent } from "@/features/account";
import { useTRPC } from "@/lib/trpc";
import { watchSleep } from "../native/healthkit";
import {
  healthConsentOf,
  lastNight,
  type WatchNight,
  watchNightStaleMs,
} from "../native/watch-sleep";

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
  const [night, setNight] = useState(() => lastNight(new Date()));

  // Back in the foreground after 06:00, "last night" is a newer night.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNight(lastNight(new Date()));
    });
    return () => subscription.remove();
  }, []);

  const accountKey = trpc.account.me.queryKey();
  const query = useQuery({
    queryKey: ["night", "watch", night, consent.health],
    queryFn: () =>
      watchSleep.readNight(night, healthConsentOf(queryClient.getQueryData(accountKey))),
    enabled: !loading,
    staleTime: (cached) => watchNightStaleMs(cached.state.data),
  });

  const data = query.data;
  // A no-consent read cached while the account reset, though consent is on again: a fresh read
  // is on its way, because only nights with data stay fresh.
  if (!data || (data.status === "no-consent" && consent.health)) return { status: "loading" };
  const retry = () => {
    const current = lastNight(new Date());
    if (current !== night) setNight(current);
    else void query.refetch();
  };
  return { ...data, night, retry };
}
