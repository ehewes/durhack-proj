import { z } from "zod";
import { speak } from "../../integrations/elevenlabs";
import { generateJson } from "../../integrations/gemini";
import { forNight } from "../attribution";
import { getNight } from "../night";
import { createBriefingService } from "./service";

const draftSchema = z.object({ text: z.string() });

const live = createBriefingService({
  getNight,
  forNight,
  write: (prompt) => generateJson(prompt, draftSchema),
  speak,
});

export const getBriefing = live.get;
