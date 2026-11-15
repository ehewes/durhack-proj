import type { VerifyOutput } from "@kip/shared/evidence";
import type { NightSummary } from "@kip/shared/night";

export const EXPLORER_TX = "https://explorer.solana.com/tx/";

export type EvidenceNight = Pick<
  NightSummary,
  "nightId" | "night" | "eventCount" | "outsideRecommendedHoursCount" | "wakeUpCount" | "evidence"
>;

export type Report = {
  nights: number;
  events: number;
  outsideHours: number;
  wakeUps: number;
};

export function isAnchored(night: EvidenceNight): boolean {
  return night.evidence.memoSignature !== null;
}

export function explorerUrl(signature: string): string {
  return `${EXPLORER_TX}${signature}`;
}

/** Newest night first. */
export function sortNights<T extends { night: string }>(nights: readonly T[]): T[] {
  return nights.slice().sort((a, b) => b.night.localeCompare(a.night));
}

/** Totals over the anchored nights only: the report covers what has a proof. */
export function buildReport(nights: readonly EvidenceNight[]): Report {
  const anchored = nights.filter(isAnchored);
  return {
    nights: anchored.length,
    events: anchored.reduce((n, x) => n + x.eventCount, 0),
    outsideHours: anchored.reduce((n, x) => n + x.outsideRecommendedHoursCount, 0),
    wakeUps: anchored.reduce((n, x) => n + x.wakeUpCount, 0),
  };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

export function verifyHeadline(status: VerifyOutput["status"]): string {
  switch (status) {
    case "match":
      return "Match";
    case "mismatch":
      return "Mismatch";
    case "not-anchored":
      return "Not anchored yet";
  }
}
