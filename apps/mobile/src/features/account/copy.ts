import type { DeleteEverythingResult } from "@kip/shared/account";
import { SAY_LINKED_TO, SAY_RELATIVE_DB, type TravellerProfile } from "@kip/shared/domain";
import type { ConsentType } from "./consent";

// Every sentence the account feature shows. Wording follows docs/DOMAIN.md; account.test.ts checks
// each one against the banned phrases.

export const ONBOARDING_TITLE = "Before Kip starts";
export const ONBOARDING_INTRO =
  "Kip asks about each kind of data separately. Nothing is on until you say yes, and your iPhone only asks for a permission after you do. You can change any answer later on the Account tab.";
export const IPHONE_CONFIRMS =
  "If you allow it, your iPhone asks you to confirm the first time Kip needs it.";
export const DONT_ALLOW = "Don't allow";

export type ConsentCopy = {
  /** Card heading */
  name: string;
  question: string;
  /** Plain explanation, one paragraph per entry */
  explain: readonly string[];
  /** One line for the Account tab */
  summary: string;
  /** Label for the yes answer */
  allow: string;
};

export const CONSENT_COPY: Readonly<Record<ConsentType, ConsentCopy>> = {
  microphone: {
    name: "Microphone",
    question: "Can Kip listen to your bedroom while you sleep?",
    explain: [
      `Kip measures how loud your room is once a second, in ${SAY_RELATIVE_DB}. Phone microphones are not calibrated, so levels are relative to your own night.`,
      "When the noise spikes, Kip keeps a short clip to work out what it was. The clip is deleted once it is labelled, and only the label is kept. A clip with speech in it never leaves your phone.",
    ],
    summary: `Bedroom noise in ${SAY_RELATIVE_DB}, and short clips of spikes that are deleted once labelled.`,
    allow: "Allow microphone",
  },
  health: {
    name: "Apple Health",
    question: "Can Kip read your sleep and heart data from Apple Health?",
    explain: [
      `Kip reads the sleep stages, heart rate, heart rate variability and breathing rate your Apple Watch records, to show which noises were ${SAY_LINKED_TO} you waking up.`,
      "Kip only reads from Apple Health and never writes to it. Each night's readings are stored with that night until you delete them.",
    ],
    summary: "Sleep stages, heart rate, heart rate variability and breathing rate, read only.",
    allow: "Allow Apple Health",
  },
  location: {
    name: "Location",
    question: "Can Kip save where you sleep?",
    explain: [
      "Kip saves your location with each night, to compare your room with the city's noise sensors nearby.",
      "Without it, your nights are still saved, just without a place.",
    ],
    summary: "Where you slept each night, to compare it with the city's noise sensors nearby.",
    allow: "Allow location",
  },
};

export const PROFILE_TITLE = "Quiet Stays";
export const PROFILE_QUESTION = "When you book somewhere to stay, what matters most to you?";
export const PROFILE_INTRO =
  "Kip ranks hotels by how well you are likely to sleep there. Your answer sets what it ranks first, and you can change it later.";

export type ProfileOption = { profile: TravellerProfile; label: string; detail: string };

/** docs/BUSINESS.md, Profiles: what Kip ranks first for each one. */
export const PROFILE_OPTIONS: readonly ProfileOption[] = [
  { profile: "lightSleeper", label: "Light sleeper", detail: "The quietest places first." },
  {
    profile: "nightOut",
    label: "Night out",
    detail: "Within walking distance of nightlife, then the quietest.",
  },
  { profile: "bestValue", label: "Best value", detail: "The most quiet for the price per night." },
  {
    profile: "business",
    label: "Business",
    detail: "Quiet on weeknights and close to the station.",
  },
];

export const FINISH = "Finish";
export const SKIP_PROFILE = "Skip this question";
export const BACK = "Back";
export const SAVING = "Saving your answers.";
export const SAVE_ERROR = "Kip could not save your answers. Check your connection and try again.";

export function stepLine(step: number, total: number): string {
  return `Step ${step} of ${total}`;
}

export const ACCOUNT_TITLE = "Account";
export const ACCOUNT_INTRO =
  "Kip has no accounts or passwords. It knows this phone only by an anonymous ID.";
export const LOADING = "Loading your account.";
export const LOAD_ERROR = "Kip could not load your account. Check your connection and try again.";
export const TRY_AGAIN = "Try again";
export const CONSENT_HEADING = "What Kip may use";
export const CONSENT_NOTE =
  "Changes apply to nights saved from now on. To remove what Kip already has, delete everything.";
export const PROFILE_HEADING = "Quiet Stays profile";
export const SAVE_CHANGE_ERROR = "Kip could not save that change. Try again.";

export const DELETE_HEADING = "Delete everything";
export const DELETE_BODY =
  "This removes your consent choices, your Quiet Stays profile and every night Kip has saved for you, with its noise levels, labels, sleep stages and heart data.";
export const DELETE_SOLANA =
  "Hashes of your evidence log that are already on Solana stay there, because the chain cannot be changed. A hash does not show what the log said.";
export const DELETE_BUTTON = "Delete everything";
export const DELETE_CONFIRM_TITLE = "Delete everything for good?";
export const DELETE_CONFIRM_BODY =
  "This cannot be undone. Kip will start again from the first question.";
export const DELETE_CONFIRM = "Yes, delete everything";
export const DELETE_CANCEL = "Cancel";
export const DELETING = "Deleting everything.";
export const DELETE_ERROR = "Kip could not finish deleting. Try again.";
export const DELETED_TITLE = "Everything is deleted";

const counted = new Intl.NumberFormat("en-GB");

function count(n: number, one: string, many: string): string {
  return `${counted.format(n)} ${n === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c" */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** What one "delete everything" removed, in a sentence. */
export function deletionSummary(result: DeleteEverythingResult): string {
  const parts = [
    result.users > 0 ? "your choices" : null,
    result.nights > 0 ? count(result.nights, "night", "nights") : null,
    result.noiseRows > 0 ? count(result.noiseRows, "noise reading", "noise readings") : null,
    result.vitalRows > 0 ? count(result.vitalRows, "health reading", "health readings") : null,
    result.stageRows > 0 ? count(result.stageRows, "sleep stage", "sleep stages") : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return "Kip had nothing stored for you.";
  return `Kip removed ${listOf(parts)}.`;
}

/** Every fixed sentence above, for the wording test. */
export const ALL_COPY: readonly string[] = [
  ONBOARDING_TITLE,
  ONBOARDING_INTRO,
  IPHONE_CONFIRMS,
  DONT_ALLOW,
  ...Object.values(CONSENT_COPY).flatMap((c) => [
    c.name,
    c.question,
    ...c.explain,
    c.summary,
    c.allow,
  ]),
  PROFILE_TITLE,
  PROFILE_QUESTION,
  PROFILE_INTRO,
  ...PROFILE_OPTIONS.flatMap((o) => [o.label, o.detail]),
  FINISH,
  SKIP_PROFILE,
  BACK,
  SAVING,
  SAVE_ERROR,
  ACCOUNT_TITLE,
  ACCOUNT_INTRO,
  LOADING,
  LOAD_ERROR,
  TRY_AGAIN,
  CONSENT_HEADING,
  CONSENT_NOTE,
  PROFILE_HEADING,
  SAVE_CHANGE_ERROR,
  DELETE_HEADING,
  DELETE_BODY,
  DELETE_SOLANA,
  DELETE_BUTTON,
  DELETE_CONFIRM_TITLE,
  DELETE_CONFIRM_BODY,
  DELETE_CONFIRM,
  DELETE_CANCEL,
  DELETING,
  DELETE_ERROR,
  DELETED_TITLE,
];
