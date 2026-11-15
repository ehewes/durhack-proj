import { createHash } from "node:crypto";
import { readMemo, writeMemo } from "../../integrations/solana";
import { getNight, setEvidence } from "../night";
import { createEvidenceService } from "./service";

export const liveEvidence = createEvidenceService({
  getNight,
  setEvidence,
  writeMemo,
  readMemo,
  sha256: (text) => createHash("sha256").update(text).digest("hex"),
});
