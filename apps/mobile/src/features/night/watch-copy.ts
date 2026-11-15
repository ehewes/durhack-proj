import { clock } from "./components/geometry";
import type { NightRead } from "./native/watch-sleep";

// What the Night tab says about last night's Apple Watch data.

export const WATCH_COPY = {
  loading: "Reading last night from Apple Health.",
  fromWatch: "Last night from your Apple Watch",
  fromHealth: "Last night from Apple Health",
  offTitle: "Apple Watch sleep",
  off: "Allow Health in the Account tab to add the sleep stages, heart rate, HRV and breathing rate your Apple Watch tracks.",
  noData: "No Apple Watch sleep for last night yet.",
  noDataHint:
    "Apple Health adds the stages after you wake, if you wore your Watch to bed with sleep tracking on. If Kip's access is off, turn it on in the Health app under Sharing, then Apps.",
  error: "Kip could not read Apple Health.",
  retry: "Try again",
  readAgain: "Read again",
  source: "Read from Apple Health on this iPhone.",
} as const;

export type WatchRow = { label: string; value: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Night of Sat 14 Nov", for a night named by its evening's date, so it is never mistaken for another. */
export function nightLabel(night: string): string {
  const day = new Date(`${night}T12:00:00Z`);
  return `Night of ${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

const ASLEEP = ["deep", "core", "rem"] as const;
const ASLEEP_LABELS = { deep: "Deep", core: "Core", rem: "REM" } as const;

function duration(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const readings = (count: number) => `${count} ${count === 1 ? "reading" : "readings"}`;
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function watchTitle(read: NightRead): string {
  return read.fromWatch ? WATCH_COPY.fromWatch : WATCH_COPY.fromHealth;
}

/** One row per thing the Watch measured: time asleep, each stage, wake-ups and each vital. */
export function watchRows(read: NightRead): WatchRow[] {
  const minutes = { inBed: 0, awake: 0, core: 0, deep: 0, rem: 0 };
  let awakeTimes = 0;
  for (const stage of read.sleep.stages) {
    minutes[stage.stage] += (Date.parse(stage.end) - Date.parse(stage.start)) / 60_000;
    if (stage.stage === "awake") awakeTimes += 1;
  }
  const asleep = ASLEEP.reduce((sum, stage) => sum + minutes[stage], 0);
  const span = `${clock(Date.parse(read.startedAt) / 1000)} to ${clock(Date.parse(read.endedAt) / 1000)}`;

  const rows: WatchRow[] = [
    asleep > 0
      ? { label: "Asleep", value: `${duration(asleep)}, ${span}` }
      : { label: "Recorded", value: `${span}, no sleep stages` },
  ];
  for (const stage of ASLEEP) {
    if (minutes[stage] > 0)
      rows.push({ label: ASLEEP_LABELS[stage], value: duration(minutes[stage]) });
  }
  if (awakeTimes > 0) {
    rows.push({ label: "Awake", value: awakeTimes === 1 ? "once" : `${awakeTimes} times` });
  }

  const heartRate = read.sleep.heartRate.map(([, bpm]) => bpm);
  if (heartRate.length > 0) {
    const low = Math.round(heartRate.reduce((a, b) => Math.min(a, b)));
    const high = Math.round(heartRate.reduce((a, b) => Math.max(a, b)));
    rows.push({
      label: "Heart rate",
      value: `${low} to ${high} bpm, ${readings(heartRate.length)}`,
    });
  }
  const hrv = read.sleep.hrv.map(([, ms]) => ms);
  if (hrv.length > 0) {
    rows.push({
      label: "HRV",
      value: `average ${Math.round(mean(hrv))} ms, ${readings(hrv.length)}`,
    });
  }
  const breathing = read.sleep.respiratoryRate.map(([, perMinute]) => perMinute);
  if (breathing.length > 0) {
    const average = Math.round(mean(breathing) * 10) / 10;
    rows.push({
      label: "Breathing rate",
      value: `average ${average} breaths a minute, ${readings(breathing.length)}`,
    });
  }
  return rows;
}
