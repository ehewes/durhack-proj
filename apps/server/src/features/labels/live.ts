import { tagAudio } from "../../integrations/elevenlabs";
import { classifyClip } from "../../integrations/gemini";
import { addEventLabels, getNight } from "../night";
import { createLabelsService } from "./service";

/** The service wired to Gemini, Scribe and the night store. Loaded lazily; see `load.ts`. */
export const liveLabels = createLabelsService({
  getNight,
  addEventLabels,
  classifyClip,
  tagAudio,
});
