import { describe, expect, test } from "bun:test";
import { bannedWording } from "@kip/shared/domain";
import type { NightRead } from "./native/watch-sleep";
import { nightLabel, WATCH_COPY, watchRows, watchTitle } from "./watch-copy";

const stage = (
  start: string,
  end: string,
  name: NightRead["sleep"]["stages"][number]["stage"],
) => ({
  start: `2026-11-1${start}:00+00:00`,
  end: `2026-11-1${end}:00+00:00`,
  stage: name,
});

const READ: NightRead = {
  startedAt: "2026-11-14T23:00:00+00:00",
  endedAt: "2026-11-15T07:05:00+00:00",
  fromWatch: true,
  sleep: {
    stages: [
      stage("4T23:00", "4T23:20", "inBed"),
      stage("4T23:20", "5T01:00", "core"),
      stage("5T01:00", "5T02:05", "deep"),
      stage("5T02:05", "5T02:09", "awake"),
      stage("5T02:09", "5T03:56", "rem"),
      stage("5T03:56", "5T06:56", "core"),
      stage("5T06:56", "5T07:05", "awake"),
    ],
    heartRate: [
      [1794704400, 48.4],
      [1794708000, 71.2],
      [1794711600, 55],
    ],
    hrv: [[1794704400, 41.6]],
    respiratoryRate: [
      [1794704400, 14],
      [1794708000, 14.5],
    ],
  },
};

describe("watch card copy", () => {
  test("lists time asleep, each stage, wake-ups and each vital", () => {
    expect(watchRows(READ)).toEqual([
      { label: "Asleep", value: "7 h 32 min, 23:00 to 07:05" },
      { label: "Deep", value: "1 h 5 min" },
      { label: "Core", value: "4 h 40 min" },
      { label: "REM", value: "1 h 47 min" },
      { label: "Awake", value: "2 times" },
      { label: "Heart rate", value: "48 to 71 bpm, 3 readings" },
      { label: "HRV", value: "average 42 ms, 1 reading" },
      { label: "Breathing rate", value: "average 14.3 breaths a minute, 2 readings" },
    ]);
    expect(watchTitle(READ)).toBe(WATCH_COPY.fromWatch);
    expect(watchTitle({ ...READ, fromWatch: false })).toBe(WATCH_COPY.fromHealth);
  });

  test("a night with vitals but no stages says so", () => {
    const rows = watchRows({
      ...READ,
      sleep: { ...READ.sleep, stages: [], hrv: [], respiratoryRate: [] },
    });
    expect(rows).toEqual([
      { label: "Recorded", value: "23:00 to 07:05, no sleep stages" },
      { label: "Heart rate", value: "48 to 71 bpm, 3 readings" },
    ]);
  });

  test("names the night it shows by its evening", () => {
    expect(nightLabel("2026-11-14")).toBe("Night of Sat 14 Nov");
    expect(nightLabel("2026-03-01")).toBe("Night of Sun 1 Mar");
  });

  test("follows the wording rules", () => {
    const lines = [
      ...Object.values(WATCH_COPY),
      ...watchRows(READ).map((r) => `${r.label} ${r.value}`),
    ];
    for (const line of lines) {
      expect(bannedWording(line)).toEqual([]);
      expect(line.includes("—")).toBe(false);
    }
  });
});
