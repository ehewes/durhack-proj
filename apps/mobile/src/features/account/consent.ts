import {
  type AccountView,
  type ConsentChoices,
  NO_CONSENT,
  type SetConsentInput,
  type SetProfileInput,
} from "@kip/shared/account";
import type { TravellerProfile } from "@kip/shared/domain";

// Pure account logic: no React, no network. docs/DOMAIN.md, Privacy: one explicit consent per
// data type, and nothing is consented to until the user answers.

export type ConsentType = keyof ConsentChoices;

/** The order onboarding asks in. */
export const CONSENT_TYPES = [
  "microphone",
  "health",
  "location",
] as const satisfies readonly ConsentType[];

/** True once the user has made their consent choices. Until then, onboarding shows. */
export function hasAnswered(view: AccountView | undefined): boolean {
  return view !== undefined && view.consentUpdatedAt !== null;
}

/** What the user said yes to. Every type is off until they answer, and while unknown. */
export function consentOf(view: AccountView | undefined): ConsentChoices {
  return view && hasAnswered(view) ? view.consent : NO_CONSENT;
}

export type AccountState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "onboarding"; view: AccountView }
  | { status: "ready"; view: AccountView };

/** Cached data wins over a failed refetch, so a flaky connection never reopens onboarding. */
export function accountState(
  view: AccountView | undefined,
  failed: boolean,
  retry: () => void,
): AccountState {
  if (view) return hasAnswered(view) ? { status: "ready", view } : { status: "onboarding", view };
  return failed ? { status: "error", retry } : { status: "loading" };
}

/** Onboarding answers: null until the user picks. */
export type ConsentDraft = Record<ConsentType, boolean | null>;

export const EMPTY_DRAFT: Readonly<ConsentDraft> = Object.freeze({
  microphone: null,
  health: null,
  location: null,
});

export function answer(draft: ConsentDraft, type: ConsentType, allowed: boolean): ConsentDraft {
  return { ...draft, [type]: allowed };
}

/** The choices to send, or null while any type is unanswered. A missing answer is never a no. */
export function draftChoices(draft: ConsentDraft): ConsentChoices | null {
  const { microphone, health, location } = draft;
  if (microphone === null || health === null || location === null) return null;
  return { microphone, health, location };
}

/** `consent` with one type changed, for the Account tab. setConsent needs all three. */
export function withChoice(
  consent: ConsentChoices,
  type: ConsentType,
  allowed: boolean,
): ConsentChoices {
  return { ...consent, [type]: allowed };
}

/** One step per data type, then the Quiet Stays profile question. */
export const ONBOARDING_STEPS = [...CONSENT_TYPES, "profile"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingWrites = {
  setProfile: (input: SetProfileInput) => Promise<AccountView>;
  setConsent: (input: SetConsentInput) => Promise<AccountView>;
};

/**
 * Saves onboarding. The profile goes first and consent last, because `consentUpdatedAt` is what
 * ends onboarding. If the consent write fails, the user stays in onboarding with the profile
 * already stored, and Finish saves both again.
 */
export async function saveOnboarding(
  writes: OnboardingWrites,
  answers: { consent: ConsentChoices; profile: TravellerProfile | null },
): Promise<AccountView> {
  if (answers.profile) await writes.setProfile({ profile: answers.profile });
  return writes.setConsent(answers.consent);
}
