import type { NoiseLabel } from "@kip/shared/domain";

/** The part of a Scribe audio-event tag we read, for example "(drilling)". */
export type ScribeTag = { text: string };

/** Keywords in a Scribe tag, first match wins. Tags are free text, so we match words. */
const KEYWORDS: readonly (readonly [NoiseLabel, RegExp])[] = [
  ["snoring", /\bsnor(e|es|ing)\b/],
  ["siren", /\b(siren|sirens|alarm|ambulance)\b/],
  [
    "construction",
    /\b(drill|drilling|hammer|hammering|jackhammer|construction|digging|sawing|saw|banging|clanging|machinery|excavator)\b/,
  ],
  ["traffic", /\b(car|cars|traffic|engine|vehicle|truck|lorry|horn|honking|motorcycle|bus)\b/],
  ["handling", /\b(rustling|rustle|rubbing|fabric|friction|crinkling|scratching)\b/],
];

/** Map one tag to a label, or null when it names nothing Kip classifies. */
export function labelForTag(text: string): NoiseLabel | null {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ");
  for (const [label, pattern] of KEYWORDS) if (pattern.test(words)) return label;
  return null;
}

/**
 * Scribe's vote for a clip: the most common mapped label, the earliest on a tie.
 * Null means Scribe heard nothing Kip can name, so it does not vote.
 */
export function scribeLabel(tags: readonly ScribeTag[]): NoiseLabel | null {
  const counts = new Map<NoiseLabel, number>();
  for (const tag of tags) {
    const label = labelForTag(tag.text);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: NoiseLabel | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}
