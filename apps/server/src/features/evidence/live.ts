import { createHash } from "node:crypto";
import { z } from "zod";
import { generateJson } from "../../integrations/gemini";
import { readMemo, writeMemo } from "../../integrations/solana";
import { getNight, setEvidence } from "../night";
import { createEvidenceService } from "./service";

const draftSchema = z.object({ text: z.string() });

export const liveEvidence = createEvidenceService({
  getNight,
  setEvidence,
  writeMemo,
  readMemo,
  draftComplaint: async (prompt) => (await generateJson(prompt, draftSchema)).text,
  sha256: (text) => createHash("sha256").update(text).digest("hex"),
});
