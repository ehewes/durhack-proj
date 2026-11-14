// User-facing wording from docs/DOMAIN.md ("Wording rules").
import { OUTSIDE_HOURS_WORDING } from "./construction-hours";

export { OUTSIDE_HOURS_WORDING };

/** Say this when linking a wake-up to a noise event. */
export const SAY_LINKED_TO = "linked to";

/** Say this when a wake-up comes after a noise event. */
export const SAY_FOLLOWED = "followed";

/** City figures and hotel scores are estimates. */
export const SAY_INDICATIVE_ESTIMATE = "indicative estimate";

/** The only unit for phone levels. Observatory sensors may say dB. */
export const SAY_RELATIVE_DB = "relative dB";

/** Required wherever simulated cohort nights affect what the user sees. */
export const SAY_SIMULATED = "simulated";

/** What a Solana memo actually proves. */
export const SAY_PROVES_WHEN_LOG_EXISTED = "proves when the log existed";

export const NEVER_CAUSED_BY = "caused by";
export const NEVER_MEASURED_DISTURBANCE = "measured disturbance";
export const NEVER_RESIDENTS_DISTURBED = "% of residents are disturbed";
export const NEVER_ILLEGAL = "illegal";
export const NEVER_BREACH = "breach";
/** Banned for phone data only. "relative dB" is the allowed form. */
export const NEVER_BARE_DB = "dB";
export const NEVER_PROVES_NOISE_HAPPENED = "proves the noise happened";

export type WordingTopic = "cause" | "city" | "hours" | "phone" | "cohort" | "evidence";

export type WordingRule = {
  topic: WordingTopic;
  /** Phrases Kip uses. */
  say: readonly string[];
  /** Phrases Kip never uses. */
  neverSay: readonly string[];
  /** Guidance that is not a single banned phrase. */
  note?: string;
};

/** The Say / Never say table in docs/DOMAIN.md, one rule per row. */
export const WORDING_RULES: readonly WordingRule[] = [
  {
    topic: "cause",
    say: [SAY_LINKED_TO, SAY_FOLLOWED],
    neverSay: [NEVER_CAUSED_BY],
  },
  {
    topic: "city",
    say: [SAY_INDICATIVE_ESTIMATE],
    neverSay: [NEVER_MEASURED_DISTURBANCE, NEVER_RESIDENTS_DISTURBED],
  },
  {
    topic: "hours",
    say: [OUTSIDE_HOURS_WORDING],
    neverSay: [NEVER_ILLEGAL, NEVER_BREACH],
  },
  {
    topic: "phone",
    say: [SAY_RELATIVE_DB],
    neverSay: [NEVER_BARE_DB],
  },
  {
    topic: "cohort",
    say: [SAY_SIMULATED],
    neverSay: [],
    note: "Label cohort data as simulated. Never imply those users are real.",
  },
  {
    topic: "evidence",
    say: [SAY_PROVES_WHEN_LOG_EXISTED],
    neverSay: [NEVER_PROVES_NOISE_HAPPENED],
  },
];

function matchesPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * Banned phrases present in `text`.
 * Pass a topic to check one row. With no topic, every row is checked, including bare dB,
 * so Observatory copy that may say dB should pass "city".
 */
export function bannedWording(text: string, topic?: WordingTopic): readonly string[] {
  const found: string[] = [];
  for (const rule of WORDING_RULES) {
    if (topic && rule.topic !== topic) continue;
    if (rule.topic === "phone") {
      const bare = text.replace(/relative dB/gi, "");
      if (/\bdB\b/i.test(bare)) found.push(NEVER_BARE_DB);
      continue;
    }
    for (const phrase of rule.neverSay) {
      if (matchesPhrase(text, phrase)) found.push(phrase);
    }
  }
  return found;
}
