import { readMemo, writeMemo } from "../../integrations/solana";
import { getNight, setEvidence } from "../night";
import { createEvidenceService } from "./service";

export const liveEvidence = createEvidenceService({ getNight, setEvidence, writeMemo, readMemo });
