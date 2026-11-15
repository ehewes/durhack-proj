// Night screen copy. Noise is relative dB from the phone, never calibrated (docs/DOMAIN.md).
export const NIGHT_COPY = {
  loading: "Loading your night.",
  error: "Kip could not load your night.",
  retry: "Try again",
  simulated: "Simulated night, shown until a real night is uploaded.",
  noiseNote: "Noise is relative dB from the phone microphone, not calibrated.",
  timelineTitle: "Timeline",
  spikesTitle: "Noise spikes",
  wakeTitle: "Wake-ups and noise",
  watchTitle: "Apple Watch",
  stagesCaption: "Sleep stages",
  noiseCaption: "Bedroom noise, relative dB. Dots are spikes.",
  wakeCaption: "Wake-ups",
  inBed: "In bed",
  spikes: "Spikes",
  wakeUps: "Wake-ups",
  noSpikes: "No noise spikes logged.",
} as const;

/** "7 h 40 min" from two ISO times. */
export function durationText(startIso: string, endIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
