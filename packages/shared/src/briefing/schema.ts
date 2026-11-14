import { z } from "zod";
import { bannedWording, WORDING_RULES } from "../domain";

/** Spoken briefings stay short enough to hear once. */
export const MAX_BRIEFING_WORDS = 40;

/** A night's briefing, and where its audio is served. */
export const briefingGetInput = z.object({
  nightId: z.uuid(),
});

export type BriefingGetInput = z.infer<typeof briefingGetInput>;

/** Collapse whitespace so a word count and a phrase check see the same text. */
export function normalizeBriefingText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function briefingWordCount(text: string): number {
  const normalized = normalizeBriefingText(text);
  if (normalized === "") return 0;
  return normalized.split(" ").length;
}

/**
 * Never-say phrases from docs/DOMAIN.md, plus `handling`.
 * Handling is the phone itself and is never briefed.
 */
export function briefingViolations(text: string): readonly string[] {
  const normalized = normalizeBriefingText(text);
  const found = [...bannedWording(normalized)];
  if (/\bhandling\b/i.test(normalized)) found.push("handling");
  return found;
}

export const briefingText = z
  .string()
  .overwrite(normalizeBriefingText)
  .refine((text) => text.length > 0 && briefingWordCount(text) <= MAX_BRIEFING_WORDS, {
    message: "Briefing must be 1 to 40 words",
  })
  .refine((text) => briefingViolations(text).length === 0, {
    message: "Briefing uses a phrase Kip never says",
  });

export type BriefingText = z.infer<typeof briefingText>;

/** The spoken text, or null when it is empty, too long, or uses a banned phrase. */
export function acceptBriefingText(text: string): string | null {
  const parsed = briefingText.safeParse(text);
  return parsed.success ? parsed.data : null;
}

/**
 * Where a night's briefing audio is served, relative to the API. The token is
 * random per briefing, so a player can fetch it without the user header.
 */
export function briefingAudioPath(nightId: string, token: string): string {
  return `/briefing/${encodeURIComponent(nightId)}/audio?token=${encodeURIComponent(token)}`;
}

export const briefingGetOutput = z.object({
  text: briefingText,
  audioUrl: z.string().startsWith("/briefing/"),
});

export type BriefingGetOutput = z.infer<typeof briefingGetOutput>;

/** Never-say phrases from docs/DOMAIN.md, quoted in the briefing prompt. */
export const BRIEFING_NEVER_SAY: readonly string[] = WORDING_RULES.flatMap((rule) => [
  ...rule.neverSay,
]);
