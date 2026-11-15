import { speak } from "../../integrations/elevenlabs";
import { classifyClip } from "../../integrations/gemini";
import { createLivePipeline } from "./pipeline";

/** The pipeline wired to Gemini and ElevenLabs. Loaded lazily; see `load.ts`. */
export const livePipeline = createLivePipeline({ classifyClip, speak });
