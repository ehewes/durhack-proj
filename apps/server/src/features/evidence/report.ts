// Council report pieces: which events, the Gemini prompt, the check on its answer, the fallback.
import { bannedWording, isOutsideRecommendedHours, toLocalTime } from "@kip/shared/domain";
import type { ReportEvent } from "@kip/shared/evidence";
import type { NightRecord } from "../night";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ReportFacts = {
  night: string;
  events: ReportEvent[];
  memo: { signature: string; explorerUrl: string; hash: string } | null;
};

function localTimeText(at: Date): string {
  const local = toLocalTime(at);
  const [, month, day] = local.date.split("-").map(Number);
  const hh = String(Math.floor(local.minutes / 60)).padStart(2, "0");
  const mm = String(local.minutes % 60).padStart(2, "0");
  return `${DAYS[local.weekday]} ${day} ${MONTHS[(month ?? 1) - 1]}, ${hh}:${mm}`;
}

/** Construction events outside the council's recommended hours, earliest first. */
export function reportEventsOf(record: NightRecord): ReportEvent[] {
  return record.events
    .filter((e) => e.label === "construction")
    .filter((e) => e.outsideRecommendedHours ?? isOutsideRecommendedHours(new Date(e.t * 1000)))
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const at = new Date(e.t * 1000);
      return {
        id: e.id,
        at: at.toISOString(),
        localTime: localTimeText(at),
        label: "construction" as const,
        relativeDb: Math.round(e.peakDb * 10) / 10,
      };
    });
}

function eventLines(events: ReportEvent[]): string {
  return events
    .map((e) => `- ${e.localTime}: construction, ${e.relativeDb} relative dB`)
    .join("\n");
}

function memoLine(memo: ReportFacts["memo"]): string {
  return memo
    ? `The log of this night was timestamped with a Solana memo: ${memo.explorerUrl}. The memo proves when the log existed, not that the noise happened.`
    : "The log of this night has not been timestamped on Solana.";
}

export function complaintPrompt(facts: ReportFacts): string {
  return [
    "Write a short, polite noise complaint a resident of Newcastle can send to the city council.",
    "Return JSON with one field, text.",
    "Rules:",
    "- Use only the facts below. Do not invent addresses, names, sites or levels.",
    "- Say the noise was outside the council's recommended hours. Never say illegal or breach.",
    "- Say relative dB for every level. These are phone readings, not calibrated levels.",
    "- Do not say the noise caused anything.",
    "- Include the memo link if there is one, and say it proves when the log existed, not that the noise happened.",
    "- Leave placeholders [name] and [address] for the resident to fill in.",
    `Night of ${facts.night}. Construction noise outside the council's recommended hours:`,
    eventLines(facts.events),
    memoLine(facts.memo),
  ].join("\n");
}

/** The draft, or null when it is empty or says something Kip must not say. */
export function acceptComplaint(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "" || bannedWording(trimmed).length > 0) return null;
  return trimmed;
}

/** Kip's own wording, used when Gemini fails or its draft breaks the wording rules. */
export function templateComplaint(facts: ReportFacts): string {
  return [
    "Dear Newcastle City Council,",
    "",
    `I am writing about construction noise near [address] on the night of ${facts.night}. My phone logged the following, outside the council's recommended hours. Levels are relative dB readings from a phone, not calibrated measurements.`,
    "",
    eventLines(facts.events),
    "",
    memoLine(facts.memo),
    "",
    "Please look into whether work is being carried out outside the recommended hours.",
    "",
    "Yours sincerely,",
    "[name]",
  ].join("\n");
}
