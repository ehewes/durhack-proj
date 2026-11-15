import type { NoiseLabel } from "@kip/shared/domain";
import {
  CLIP_MIME_TYPES,
  type ClipUploadResult,
  type LabelsForNightOutput,
  MAX_CLIP_BYTES,
  SPIKE_MATCH_SECONDS,
} from "@kip/shared/labels";
import type { EventLabelPatch, NightEvent } from "@kip/shared/night";
import { NightNotFoundError, type NightRecord } from "../night";

export type ClipFailure = "type" | "size" | "format" | "event" | "classifier";

/** A clip that cannot be labelled. Messages never include audio. */
export class LabelsClipError extends Error {
  readonly failure: ClipFailure;
  constructor(failure: ClipFailure, message: string) {
    super(message);
    this.name = "LabelsClipError";
    this.failure = failure;
  }
}

/** Night storage and the classifier this feature is allowed to use. */
export type LabelsDeps = {
  getNight(nightId: string): Promise<NightRecord | null>;
  addEventLabels(
    userId: string,
    nightId: string,
    patches: readonly EventLabelPatch[],
  ): Promise<NightRecord>;
  classifyClip(bytes: Uint8Array, mime: string): Promise<{ label: NoiseLabel }>;
};

export type LabelClipInput = {
  userId: string;
  nightId: string;
  /** Spike time, epoch seconds */
  t: number;
  /** Content-Type header as sent */
  mime: string;
  bytes: Uint8Array;
};

/** The base media type, lower-cased, or null if it is not a WAV type. */
export function clipMime(contentType: string): string | null {
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return (CLIP_MIME_TYPES as readonly string[]).includes(base) ? base : null;
}

function isWav(bytes: Uint8Array): boolean {
  const tag = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return bytes.byteLength >= 12 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

function nearestEvent(events: readonly NightEvent[], t: number): NightEvent | null {
  let best: NightEvent | null = null;
  for (const event of events) {
    const gap = Math.abs(event.t - t);
    if (gap > SPIKE_MATCH_SECONDS) continue;
    if (!best || gap < Math.abs(best.t - t)) best = event;
  }
  return best;
}

export function createLabelsService(deps: LabelsDeps) {
  async function ownedNight(userId: string, nightId: string): Promise<NightRecord> {
    const record = await deps.getNight(nightId);
    if (!record || record.userId !== userId) throw new NightNotFoundError(nightId);
    return record;
  }

  return {
    /**
     * Label one spike clip and keep only the label. The bytes live in this call's
     * arguments: they go to the classifier and nowhere else (docs/DOMAIN.md, Privacy).
     */
    async labelClip(input: LabelClipInput): Promise<ClipUploadResult> {
      const mime = clipMime(input.mime);
      if (!mime) throw new LabelsClipError("type", "Clips must be audio/wav");
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_CLIP_BYTES) {
        throw new LabelsClipError("size", `Clips must be 1 to ${MAX_CLIP_BYTES} bytes`);
      }
      if (!isWav(input.bytes)) throw new LabelsClipError("format", "Clip is not a WAV file");

      const record = await ownedNight(input.userId, input.nightId);
      const event = nearestEvent(record.events, input.t);
      if (!event) throw new LabelsClipError("event", "No spike at that time");

      let label: NoiseLabel;
      try {
        label = (await deps.classifyClip(input.bytes, mime)).label;
      } catch {
        throw new LabelsClipError("classifier", "The clip could not be labelled");
      }
      const updated = await deps.addEventLabels(input.userId, input.nightId, [
        { id: event.id, gemini: label },
      ]);
      const stored = updated.events.find((e) => e.id === event.id);
      return { eventId: event.id, label: stored?.label ?? label };
    },

    async forNight(userId: string, nightId: string): Promise<LabelsForNightOutput> {
      const record = await ownedNight(userId, nightId);
      return {
        nightId,
        events: record.events.map((e) => ({
          id: e.id,
          t: e.t,
          label: e.label,
          outsideRecommendedHours: e.outsideRecommendedHours,
        })),
      };
    },
  };
}

export type LabelsService = ReturnType<typeof createLabelsService>;
