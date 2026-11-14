/** Look-back window before a wake-up in which a spike counts, in seconds (docs/DOMAIN.md). */
export const ATTRIBUTION_WINDOW_SECONDS = { min: 60, max: 120 } as const;

/** Show percentages only once this many nights are pooled; below it, show counts.
 *  Provisional: the plan says "several nights". Tune with real data. */
export const MIN_NIGHTS_FOR_PERCENTAGE = 5;
