// Business logic for `evidence`. Other features may call only what index.ts re-exports from here.
import {
  type AnchorOutput,
  canonicalJson,
  EVIDENCE_NOTE,
  memoText,
  parseMemo,
  type ReportOutput,
  type VerifyOutput,
} from "@kip/shared/evidence";
import { NightNotFoundError, type NightRecord } from "../night";
import { EvidenceChainError } from "./errors";
import { acceptComplaint, complaintPrompt, reportEventsOf, templateComplaint } from "./report";

const EXPLORER_TX = "https://explorer.solana.com/tx/";

export type EvidenceDeps = {
  getNight(nightId: string): Promise<NightRecord | null>;
  setEvidence(
    userId: string,
    nightId: string,
    evidence: { hash: string | null; memoSignature: string | null },
  ): Promise<unknown>;
  writeMemo(text: string): Promise<{ signature: string; explorerUrl: string }>;
  readMemo(signature: string): Promise<string>;
  /** One Gemini call: the prompt in, the complaint text out. Throws on failure. */
  draftComplaint(prompt: string): Promise<string>;
  /** SHA-256 of a string as lowercase hex. Injected so this file has no Node imports. */
  sha256(text: string): string;
};

export type EvidenceService = {
  anchor(userId: string, nightId: string): Promise<AnchorOutput>;
  verify(nightId: string): Promise<VerifyOutput>;
  report(userId: string, nightId: string): Promise<ReportOutput>;
};

/**
 * The log is the night as the night screen draws it: every field of the record except the
 * evidence fields (they hold the hash itself) and the owner's private fields (user id,
 * consent, location, vitals).
 */
export function logOf(record: NightRecord): Record<string, unknown> {
  const log: Record<string, unknown> = { ...record };
  for (const key of ["evidence", "userId", "consent", "location", "vitals"]) delete log[key];
  return log;
}

function chainError(fallback: string) {
  return (error: unknown): never => {
    throw new EvidenceChainError(error instanceof Error ? error.message : fallback);
  };
}

export function createEvidenceService(deps: EvidenceDeps): EvidenceService {
  const hashLog = (record: NightRecord) => deps.sha256(canonicalJson(logOf(record)));

  async function requireNight(nightId: string): Promise<NightRecord> {
    const record = await deps.getNight(nightId);
    if (!record) throw new NightNotFoundError(nightId);
    return record;
  }

  return {
    async anchor(userId, nightId) {
      const record = await requireNight(nightId);
      if (record.userId !== userId) throw new NightNotFoundError(nightId);
      const hash = hashLog(record);
      const { memoSignature } = record.evidence;
      if (memoSignature && record.evidence.hash === hash) {
        return {
          nightId,
          hash,
          signature: memoSignature,
          explorerUrl: `${EXPLORER_TX}${memoSignature}`,
          alreadyAnchored: true,
        };
      }
      const receipt = await deps
        .writeMemo(memoText(nightId, hash))
        .catch(chainError("Solana write failed"));
      await deps.setEvidence(userId, nightId, { hash, memoSignature: receipt.signature });
      return {
        nightId,
        hash,
        signature: receipt.signature,
        explorerUrl: receipt.explorerUrl,
        alreadyAnchored: false,
      };
    },

    async report(userId, nightId) {
      const record = await requireNight(nightId);
      if (record.userId !== userId) throw new NightNotFoundError(nightId);
      const events = reportEventsOf(record);
      const { hash, memoSignature } = record.evidence;
      // A memo for an older version of the log would not timestamp what the report lists.
      const memo =
        memoSignature && hash && hash === hashLog(record)
          ? { signature: memoSignature, explorerUrl: `${EXPLORER_TX}${memoSignature}`, hash }
          : null;
      let draft: string | null = null;
      let draftSource: "gemini" | "template" | null = null;
      if (events.length > 0) {
        const facts = { night: record.night, events, memo };
        // The draft is not logged: it can repeat a phrase Kip must not say.
        const accepted = await deps
          .draftComplaint(complaintPrompt(facts))
          .then(acceptComplaint)
          .catch(() => null);
        draft = accepted ?? templateComplaint(facts);
        draftSource = accepted ? "gemini" : "template";
      }
      return {
        nightId,
        night: record.night,
        events,
        memo,
        draft,
        draftSource,
        note: EVIDENCE_NOTE,
      };
    },

    async verify(nightId) {
      const record = await requireNight(nightId);
      const currentHash = hashLog(record);
      const signature = record.evidence.memoSignature;
      if (!signature) {
        return {
          nightId,
          status: "not-anchored",
          currentHash,
          anchoredHash: null,
          signature: null,
          explorerUrl: null,
          note: EVIDENCE_NOTE,
        };
      }
      const text = await deps.readMemo(signature).catch(chainError("Solana read failed"));
      const memo = parseMemo(text);
      const anchoredHash = memo?.nightId === nightId ? memo.hash : null;
      return {
        nightId,
        status: anchoredHash === currentHash ? "match" : "mismatch",
        currentHash,
        anchoredHash,
        signature,
        explorerUrl: `${EXPLORER_TX}${signature}`,
        note: EVIDENCE_NOTE,
      };
    },
  };
}
