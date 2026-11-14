import { acceptBriefingText, BRIEFING_NEVER_SAY, MAX_BRIEFING_WORDS } from "@kip/shared/briefing";
import { OUTSIDE_HOURS_WORDING, SAY_FOLLOWED, WORDING_RULES } from "@kip/shared/domain";
import type { BriefingEventFact, BriefingFacts } from "./facts";

const COUNT_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
] as const;

const QUIET = `No wake-ups ${SAY_FOLLOWED} a noise event.`;

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${last}`;
}

function finish(body: string): string {
  const trimmed = body.trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function capitalise(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wakeNoun(count: number): string {
  return count === 1 ? "wake-up" : "wake-ups";
}

function linkedEvents(facts: BriefingFacts): BriefingEventFact[] {
  return facts.events.filter((event) => event.wakeUpsThatFollowedIt > 0);
}

function followedLine(facts: BriefingFacts, events: readonly BriefingEventFact[]): string | null {
  const count = facts.wakeUpsThatFollowedANoiseEvent;
  if (count <= 0) return null;
  const head = `${countWord(count)} ${wakeNoun(count)} ${SAY_FOLLOWED}`;
  if (events.length === 0) return `${head} a noise event.`;
  const named = events.map((event) => `${event.sound} at ${event.time}`);
  const only = events.length === 1 ? events[0] : undefined;
  const onlyPhrase = named[0];
  if (only?.outsideRecommendedHours && onlyPhrase) {
    return finish(`${head} ${onlyPhrase}, ${OUTSIDE_HOURS_WORDING}`);
  }
  let text = finish(`${head} ${joinAnd(named)}`);
  const hours = outsideLine(events.filter((event) => event.outsideRecommendedHours));
  if (hours) text = `${text} ${hours}`;
  return text;
}

function outsideLine(events: readonly BriefingEventFact[]): string | null {
  if (events.length === 0) return null;
  const named = joinAnd(events.map((event) => `${event.sound} at ${event.time}`));
  const verb = events.length === 1 ? "was" : "were";
  return capitalise(finish(`${named} ${verb} ${OUTSIDE_HOURS_WORDING}`));
}

function acceptable(text: string | null): string | null {
  if (text === null) return null;
  return acceptBriefingText(text);
}

/**
 * A briefing Kip can say when the model reply is missing or breaks the rules.
 * It uses the attribution count and the approved hours phrase.
 */
export function fallbackBriefing(facts: BriefingFacts): string {
  const linked = linkedEvents(facts);
  const full = acceptable(followedLine(facts, linked));
  if (full) return full;

  if (facts.wakeUpsThatFollowedANoiseEvent > 0) {
    const outside = linked.filter((event) => event.outsideRecommendedHours);
    const one = outside[0] ?? linked[linked.length - 1];
    const short = acceptable(followedLine(facts, one ? [one] : []));
    if (short) return short;
    const count = facts.wakeUpsThatFollowedANoiseEvent;
    return `${countWord(count)} ${wakeNoun(count)} ${SAY_FOLLOWED} a noise event.`;
  }

  const outside = facts.events.filter((event) => event.outsideRecommendedHours);
  const hours = acceptable(outsideLine(outside));
  if (hours) return hours;
  const first = outside[0];
  const oneHour = acceptable(first ? outsideLine([first]) : null);
  if (oneHour) return oneHour;
  return QUIET;
}

/** Prompt for Gemini. Facts already exclude handling events and phone levels. */
export function briefingPrompt(facts: BriefingFacts): string {
  const say = WORDING_RULES.flatMap((rule) => rule.say);
  return [
    "Write the morning briefing Kip will read aloud.",
    `Use at most ${MAX_BRIEFING_WORDS} words.`,
    "Use only the facts below. Do not invent events, times or counts.",
    `Prefer these phrases when they fit: ${say.join("; ")}.`,
    `Never use these phrases: ${BRIEFING_NEVER_SAY.join("; ")}.`,
    "Do not mention phone-movement noise. It is not in the facts.",
    'Return JSON with one string field named "text".',
    "Facts:",
    JSON.stringify(facts),
  ].join("\n");
}
