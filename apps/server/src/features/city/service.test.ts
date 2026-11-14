import { describe, expect, test } from "bun:test";
import { roadTrafficDisturbance } from "@kip/shared/domain";
import type { CityRepo, SensorLevelWrite, SensorLnightReport } from "./repo";
import { refreshSensorLnight, sensorLevelWrite } from "./service";

const latest = new Date("2026-11-14T07:00:00.000Z");

function report(overrides: Partial<SensorLnightReport> = {}): SensorLnightReport {
  return {
    sensorId: "full",
    nights: 30,
    lnight30: 55,
    notEnoughData: false,
    latestBucket: latest,
    ...overrides,
  };
}

describe("sensorLevelWrite", () => {
  test("turns 30 nights into an indicative WHO estimate", () => {
    const level = sensorLevelWrite(report());
    expect(level).toEqual({
      sensorId: "full",
      lnight30: 55,
      pctHighlySleepDisturbed: roadTrafficDisturbance(55).percentHighlyDisturbed,
      nights: 30,
      outOfRange: false,
      notEnoughData: false,
      indicative: true,
    });
    expect(level.pctHighlySleepDisturbed).toBeCloseTo(6.2, 1);
  });

  test("clamps the curve outside 40 to 65 dB and keeps the measured Lnight", () => {
    expect(sensorLevelWrite(report({ lnight30: 66.8 })).outOfRange).toBe(true);
    expect(sensorLevelWrite(report({ lnight30: 66.8 })).pctHighlySleepDisturbed).toBe(
      roadTrafficDisturbance(65).percentHighlyDisturbed,
    );
    expect(sensorLevelWrite(report({ lnight30: 66.8 })).lnight30).toBe(66.8);
    expect(sensorLevelWrite(report({ lnight30: 38.6 })).outOfRange).toBe(true);
    expect(sensorLevelWrite(report({ lnight30: 38.6 })).lnight30).toBe(38.6);
  });

  test("stores no estimate when the report says there is not enough data", () => {
    expect(sensorLevelWrite(report({ nights: 12, lnight30: null, notEnoughData: true }))).toEqual({
      sensorId: "full",
      lnight30: null,
      pctHighlySleepDisturbed: null,
      nights: 12,
      outOfRange: false,
      notEnoughData: true,
      indicative: true,
    });
  });
});

describe("refreshSensorLnight", () => {
  function mockRepo(rows: SensorLnightReport[]) {
    const written: SensorLevelWrite[][] = [];
    const asked: Date[] = [];
    const repo: Pick<CityRepo, "lnight30" | "writeSensorLevels"> = {
      lnight30: async (now = new Date()) => {
        asked.push(now);
        return rows;
      },
      writeSensorLevels: async (levels) => {
        written.push(levels);
      },
    };
    return { repo, written, asked };
  }

  test("writes the curve for a full sensor and nulls a short one", async () => {
    const now = new Date("2026-11-15T10:00:00.000Z");
    const { repo, written, asked } = mockRepo([
      report({ sensorId: "zeta" }),
      report({ sensorId: "alpha", nights: 12, lnight30: null, notEnoughData: true }),
    ]);
    const updated = await refreshSensorLnight({ repo, now });
    expect(updated).toBe(2);
    expect(asked).toEqual([now]);
    expect(written).toHaveLength(1);
    expect(written[0]?.map((level) => level.sensorId)).toEqual(["alpha", "zeta"]);
    expect(written[0]?.[0]).toMatchObject({
      lnight30: null,
      pctHighlySleepDisturbed: null,
      notEnoughData: true,
      indicative: true,
    });
    expect(written[0]?.[1]).toMatchObject({
      lnight30: 55,
      pctHighlySleepDisturbed: roadTrafficDisturbance(55).percentHighlyDisturbed,
      outOfRange: false,
      notEnoughData: false,
      indicative: true,
    });
  });

  test("writes an empty level list when no sensor has a night yet", async () => {
    const { repo, written } = mockRepo([]);
    expect(await refreshSensorLnight({ repo, now: new Date("2026-11-15T10:00:00.000Z") })).toBe(0);
    expect(written).toEqual([[]]);
  });
});
