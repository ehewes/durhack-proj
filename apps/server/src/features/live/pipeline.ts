import { acceptBriefingText } from "@kip/shared/briefing";
import {
  isOutsideRecommendedHours,
  type NoiseLabel,
  OUTSIDE_HOURS_WORDING,
  toLocalTime,
} from "@kip/shared/domain";
import { CLIP_MIME_TYPES, MAX_CLIP_BYTES, SPIKE_MATCH_SECONDS } from "@kip/shared/labels";
import type { LiveEvent, LiveSpike } from "@kip/shared/live";
import { type LiveAudioStore, liveAudioStore } from "./audio";
import { publishLiveEvent, spikeNear } from "./service";

/** Spike clip to spoken briefing must finish inside this (issue #55). */
export const LIVE_BUDGET_MS = 10_000;
/** Kept back from the budget for publishing, so the briefing never runs the clock out. */
const PUBLISH_RESERVE_MS = 500;

export type LiveClipFailure = "type" | "size" | "format" | "spike" | "classifier";

/** A clip that cannot become an event. Messages never include audio. */
export class LiveClipError extends Error {
  readonly failure: LiveClipFailure;
  constructor(failure: LiveClipFailure, message: string) {
    super(message);
    this.name = "LiveClipError";
    this.failure = failure;
  }
}

/** The external calls this pipeline makes. Tests replace them. */
export type LivePipelineDeps = {
  classifyClip(bytes: Uint8Array, mime: string): Promise<{ label: NoiseLabel }>;
  speak(text: string): Promise<Uint8Array>;
  audio?: LiveAudioStore;
  /** Clock for the budget. */
  now?: () => number;
};

export type LiveClipInput = {
  /** Spike time, epoch seconds */
  t: number;
  /** Content-Type header as sent */
  mime: string;
  bytes: Uint8Array;
  /** Scheme and host the viewer reaches the API on, for the absolute audio URL. */
  origin: string;
};

function wavMime(contentType: string): string | null {
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return (CLIP_MIME_TYPES as readonly string[]).includes(base) ? base : null;
}

function isWav(bytes: Uint8Array): boolean {
  const tag = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return bytes.byteLength >= 12 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

/**
 * The spoken line. Fixed wording rather than a model draft: it has to land within seconds,
 * and it can only say what the pipeline knows (docs/DOMAIN.md, Wording rules).
 */
export function briefingLine(label: NoiseLabel, spike: LiveSpike, outside: boolean): string | null {
  const at = toLocalTime(new Date(spike.t * 1000)).minutes;
  const clock = `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
  const noise = label === "uncertain" || label === "other" ? "loud noise" : `${label} noise`;
  const name = `${noise.charAt(0).toUpperCase()}${noise.slice(1)}`;
  const hours = label === "construction" && outside ? `, ${OUTSIDE_HOURS_WORDING}` : "";
  return acceptBriefingText(`${name} at ${clock}${hours}.`);
}

/** Resolve with the speech, or null once `ms` has passed or the call fails. */
async function speakWithin(
  speak: LivePipelineDeps["speak"],
  text: string,
  ms: number,
): Promise<Uint8Array | null> {
  if (ms <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([speak(text).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createLivePipeline(deps: LivePipelineDeps) {
  const store = deps.audio ?? liveAudioStore();
  const now = deps.now ?? Date.now;

  return {
    /**
     * Label a spike's clip, check the shared hours rule, speak a short briefing and publish
     * one `LiveEvent`. The clip bytes go to the classifier and nowhere else. A briefing that
     * fails or runs out of time still publishes the event, without audio.
     */
    async process(input: LiveClipInput): Promise<LiveEvent> {
      const started = now();
      const mime = wavMime(input.mime);
      if (!mime) throw new LiveClipError("type", "Clips must be audio/wav");
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_CLIP_BYTES) {
        throw new LiveClipError("size", `Clips must be 1 to ${MAX_CLIP_BYTES} bytes`);
      }
      if (!isWav(input.bytes)) throw new LiveClipError("format", "Clip is not a WAV file");
      const spike = spikeNear(input.t, SPIKE_MATCH_SECONDS);
      if (!spike) throw new LiveClipError("spike", "No spike at that time");

      let label: NoiseLabel;
      try {
        label = (await deps.classifyClip(input.bytes, mime)).label;
      } catch {
        throw new LiveClipError("classifier", "The clip could not be labelled");
      }

      const outside = isOutsideRecommendedHours(new Date(spike.t * 1000));
      let briefingAudioUrl: string | null = null;
      const line = label === "handling" ? null : briefingLine(label, spike, outside);
      if (line) {
        const left = LIVE_BUDGET_MS - PUBLISH_RESERVE_MS - (now() - started);
        const audio = await speakWithin(deps.speak, line, left);
        if (audio && audio.byteLength > 0) {
          const path = store.write(String(spike.t), audio);
          briefingAudioUrl = new URL(path, input.origin).href;
        }
      }
      return publishLiveEvent({
        spike,
        label,
        outsideRecommendedHours: outside,
        briefingAudioUrl,
      });
    },
  };
}

export type LivePipeline = ReturnType<typeof createLivePipeline>;
