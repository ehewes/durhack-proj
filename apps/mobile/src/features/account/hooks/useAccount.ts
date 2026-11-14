import type { ConsentChoices, DeleteEverythingResult } from "@kip/shared/account";
import type { TravellerProfile } from "@kip/shared/domain";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { accountCache } from "../cache";
import {
  type AccountState,
  accountState,
  type ConsentType,
  consentOf,
  hasAnswered,
  saveOnboarding,
} from "../consent";

/** `account.me`. The gate, the Account tab and every consent check share this one query. */
export function useAccount(): AccountState {
  const trpc = useTRPC();
  const me = useQuery({ ...trpc.account.me.queryOptions(), retry: 1 });
  return accountState(me.data, me.isError, () => void me.refetch());
}

export type ConsentState = {
  /** What the user said yes to. Every type is false until they answer, and while loading or offline */
  consent: ConsentChoices;
  /** The user has made their choices at least once */
  answered: boolean;
  loading: boolean;
};

/** The user's consent per data type. Use `consent` as the `consent` flags of a night upload. */
export function useConsent(): ConsentState {
  const state = useAccount();
  const view = state.status === "ready" || state.status === "onboarding" ? state.view : undefined;
  return {
    consent: consentOf(view),
    answered: hasAnswered(view),
    loading: state.status === "loading",
  };
}

/**
 * True only once the user has said yes to `type` in Kip. Ask iOS for the matching permission
 * (microphone, HealthKit, location) only while this is true.
 */
export function useHasConsent(type: ConsentType): boolean {
  return useConsent().consent[type];
}

function useAccountCache() {
  const trpc = useTRPC();
  return accountCache(useQueryClient(), trpc.account.me.queryKey());
}

/** Saves the onboarding answers: the profile, then consent (see `saveOnboarding`). */
export function useFinishOnboarding() {
  const client = useTRPCClient();
  const cache = useAccountCache();
  return useMutation({
    mutationFn: (answers: { consent: ConsentChoices; profile: TravellerProfile | null }) =>
      saveOnboarding(
        {
          setProfile: (input) => client.account.setProfile.mutate(input),
          setConsent: (input) => client.account.setConsent.mutate(input),
        },
        answers,
      ),
    onSuccess: cache.write,
  });
}

// The Account tab allows one account write at a time (AccountSettings), so responses cannot
// arrive out of order, and nothing is saved while a delete runs.

export function useSaveConsent() {
  const trpc = useTRPC();
  const cache = useAccountCache();
  return useMutation(trpc.account.setConsent.mutationOptions({ onSuccess: cache.write }));
}

export function useSaveProfile() {
  const trpc = useTRPC();
  const cache = useAccountCache();
  return useMutation(trpc.account.setProfile.mutationOptions({ onSuccess: cache.write }));
}

/**
 * Deletes everything on the server, then resets every cached query, so nothing of the old data
 * stays on screen and every consent reads as off until the user answers again.
 */
export function useDeleteEverything() {
  const trpc = useTRPC();
  const cache = useAccountCache();
  return useMutation(
    trpc.account.deleteEverything.mutationOptions({
      onSuccess: () => {
        void cache.forget();
      },
    }),
  );
}

export type DeleteMutation = ReturnType<typeof useDeleteEverything>;

/** The latest successful "delete everything", for the notice above onboarding. */
export function useLastDeletion(): DeleteEverythingResult | undefined {
  const trpc = useTRPC();
  const results = useMutationState({
    filters: { mutationKey: trpc.account.deleteEverything.mutationKey(), status: "success" },
    select: (mutation) => mutation.state.data as DeleteEverythingResult | undefined,
  });
  return results.at(-1);
}
