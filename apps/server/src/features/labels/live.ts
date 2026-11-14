import { classifyClip } from "../../integrations/gemini";
import { addEventLabels, getNight } from "../night";
import { createLabelsService } from "./service";

/** The service wired to Gemini and the night store. Loaded lazily; see `load.ts`. */
export const liveLabels = createLabelsService({ getNight, addEventLabels, classifyClip });
