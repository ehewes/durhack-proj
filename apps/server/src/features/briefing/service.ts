import type { AttributionForNightOutput } from "@kip/shared/attribution";
import {
  acceptBriefingText,
  type BriefingGetOutput,
  briefingAudioPath,
  briefingGetOutput,
} from "@kip/shared/briefing";
import { z } from "zod";
import { speak } from "../../integrations/elevenlabs";
import { generateJson } from "../../integrations/gemini";
import { forNight as attributeNight } from "../attribution";
import { getNight as loadNight, NightConsentError, type NightRecord } from "../night";
import { type BriefingCache, briefingCache } from "./cache";
import { briefingPrompt, fallbackBriefing } from "./compose";
import { briefingFacts } from "./facts";

const draftSchema = z.object({ text: z.string() });

export class BriefingNotFoundError extends Error {
  constructor() {
    super("Night not found");
    this.name = "BriefingNotFoundError";
  }
}

export class BriefingAudioError extends Error {
  constructor() {
    super("Briefing audio failed");
    this.name = "BriefingAudioError";
  }
}

export type BriefingWriter = (prompt: string) => Promise<{ text: string }>;
export type BriefingSpeaker = (text: string) => Promise<Uint8Array>;

export type BriefingDeps = {
  getNight: (nightId: string) => Promise<NightRecord | null>;
  forNight: (userId: string, nightId: string) => Promise<AttributionForNightOutput>;
  write: BriefingWriter;
  speak: BriefingSpeaker;
};

async function writeWithGemini(prompt: string): Promise<{ text: string }> {
  return generateJson(prompt, draftSchema);
}

const liveDeps: BriefingDeps = {
  getNight: loadNight,
  forNight: attributeNight,
  write: writeWithGemini,
  speak,
};

const WRITE_ATTEMPTS = 2;

async function writtenBriefing(facts: ReturnType<typeof briefingFacts>, write: BriefingWriter) {
  const prompt = briefingPrompt(facts);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    try {
      const draft = await write(prompt);
      const accepted = acceptBriefingText(draft.text);
      if (accepted) return accepted;
      // The draft is not logged: it can repeat a phrase Kip must not say.
      console.warn("briefing: draft rejected");
    } catch {
      console.warn("briefing: draft failed");
    }
  }
  const fallback = acceptBriefingText(fallbackBriefing(facts));
  if (!fallback) throw new Error("Briefing could not be written");
  return fallback;
}

export function createBriefingService(
  deps: BriefingDeps = liveDeps,
  cache: BriefingCache = briefingCache(),
) {
  return {
    async get(userId: string, nightId: string): Promise<BriefingGetOutput> {
      const record = await deps.getNight(nightId);
      if (!record || record.userId !== userId) throw new BriefingNotFoundError();

      let attribution: AttributionForNightOutput | null = null;
      if (record.consent.health) {
        try {
          attribution = await deps.forNight(userId, nightId);
        } catch (error) {
          if (!(error instanceof NightConsentError)) throw error;
        }
      }

      const facts = briefingFacts(record, attribution);
      const fingerprint = JSON.stringify(facts);
      const cached = cache.read(nightId);
      if (cached && cached.userId === userId && cached.fingerprint === fingerprint) {
        return briefingGetOutput.parse({ text: cached.text, audioUrl: briefingAudioPath(nightId) });
      }

      const text = await writtenBriefing(facts, deps.write);
      let audio: Uint8Array;
      try {
        audio = await deps.speak(text);
      } catch {
        console.warn("briefing: speech failed");
        throw new BriefingAudioError();
      }
      if (audio.byteLength === 0) throw new BriefingAudioError();

      cache.write(nightId, { userId, fingerprint, text, audio });
      return briefingGetOutput.parse({ text, audioUrl: briefingAudioPath(nightId) });
    },
  };
}

export type BriefingService = ReturnType<typeof createBriefingService>;

const live = createBriefingService();

export const getBriefing = live.get;
