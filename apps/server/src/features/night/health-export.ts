import { createHash } from "node:crypto";
import { nightOf, TIME_ZONE } from "@kip/shared/domain";
import { type NightUpload, nightUpload } from "@kip/shared/night";

type Stage = NonNullable<NightUpload["sleep"]>["stages"][number];
type Series = "heartRate" | "hrv" | "respiratoryRate";
type Sample = [number, number];

/** Health app record types we read; every other `<Record>` is skipped. */
const SERIES_BY_TYPE: Record<string, Series> = {
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
};
const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";

/** Unspecified "asleep" (pre-iOS 16 data) has no stage, so it counts as core sleep. */
const STAGE_BY_VALUE: Record<string, Stage["stage"]> = {
  HKCategoryValueSleepAnalysisInBed: "inBed",
  HKCategoryValueSleepAnalysisAwake: "awake",
  HKCategoryValueSleepAnalysisAsleepCore: "core",
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "core",
  HKCategoryValueSleepAnalysisAsleep: "core",
};

export type ParsedNight = {
  stages: Stage[];
  heartRate: Sample[];
  hrv: Sample[];
  respiratoryRate: Sample[];
};

export type NightCollector = {
  /** Feed one line of `export.xml`; lines that are not a wanted record are ignored. */
  add(line: string): void;
  finish(): ParsedNight;
};

const ATTRIBUTE = /(\w+)="([^"]*)"/g;
const DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/;

function attributes(line: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, key, value] of line.matchAll(ATTRIBUTE)) {
    if (key && value !== undefined) found[key] = value;
  }
  return found;
}

/** "2026-11-13 23:04:12 +0000" to "2026-11-13T23:04:12+00:00", or null if it is not that shape. */
export function exportDateToIso(value: string): string | null {
  const m = DATE.exec(value);
  if (!m) return null;
  return `${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`;
}

/**
 * Collects one night from the Health app's `export.xml`. The night is named by the evening's
 * London date, as everywhere else ("2026-11-13" for the night into the 14th). Readings are
 * trimmed to the span of that night's sleep stages, so daytime readings never leak in.
 */
export function collectNight(night: string): NightCollector {
  const stages: Stage[] = [];
  const series: Record<Series, Sample[]> = { heartRate: [], hrv: [], respiratoryRate: [] };

  return {
    add(line) {
      if (!line.includes("<Record ")) return;
      const a = attributes(line);
      const startIso = a.startDate ? exportDateToIso(a.startDate) : null;
      if (!a.type || !startIso) return;
      const start = new Date(startIso);
      if (nightOf(start) !== night) return;

      if (a.type === SLEEP_TYPE) {
        const stage = a.value ? STAGE_BY_VALUE[a.value] : undefined;
        const endIso = a.endDate ? exportDateToIso(a.endDate) : null;
        if (stage && endIso) stages.push({ start: startIso, end: endIso, stage });
        return;
      }
      const name = SERIES_BY_TYPE[a.type];
      const value = Number(a.value);
      if (name && Number.isFinite(value)) series[name].push([start.getTime() / 1000, value]);
    },

    finish() {
      stages.sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
      const first = stages[0];
      if (!first) return { stages, heartRate: [], hrv: [], respiratoryRate: [] };
      const from = Date.parse(first.start) / 1000;
      const to = Math.max(...stages.map((s) => Date.parse(s.end))) / 1000;
      const within = (samples: Sample[]) =>
        samples.filter(([t]) => t >= from && t <= to).sort((x, y) => x[0] - y[0]);
      return {
        stages,
        heartRate: within(series.heartRate),
        hrv: within(series.hrv),
        respiratoryRate: within(series.respiratoryRate),
      };
    },
  };
}

/** The same user and night always give the same ID, so re-running an import changes nothing. */
export function importedNightId(userId: string, night: string): string {
  const h = createHash("sha256").update(`kip-health-export:${userId}:${night}`).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x40;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Build the upload for a parsed night. Health only: an export holds no microphone data. */
export function buildUpload(userId: string, night: string, parsed: ParsedNight): NightUpload {
  const first = parsed.stages[0];
  if (!first) throw new Error(`No sleep stages for the night of ${night} (${TIME_ZONE})`);
  const last = parsed.stages.reduce((a, s) => (Date.parse(s.end) > Date.parse(a.end) ? s : a));
  return nightUpload.parse({
    nightId: importedNightId(userId, night),
    userId,
    startedAt: first.start,
    endedAt: last.end,
    consent: { microphone: false, health: true, location: false },
    noise: { baselineDb: 0, samples: [] },
    spikes: [],
    sleep: parsed,
  });
}
