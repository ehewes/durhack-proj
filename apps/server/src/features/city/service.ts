import { roadTrafficDisturbance } from "@kip/shared/domain";
import type { CityRepo, SensorLevelWrite, SensorLnightReport } from "./repo";

/**
 * Level fields for one sensor. The WHO curve clamps outside 40 to 65 dB and
 * sets `outOfRange`; the stored Lnight stays the measured energy average.
 * Fewer than 30 nights stores no Lnight and no %HSD.
 */
export function sensorLevelWrite(report: SensorLnightReport): SensorLevelWrite {
  if (report.notEnoughData || report.lnight30 === null) {
    return {
      sensorId: report.sensorId,
      lnight30: null,
      pctHighlySleepDisturbed: null,
      nights: report.nights,
      outOfRange: false,
      notEnoughData: true,
      indicative: true,
    };
  }
  const disturbance = roadTrafficDisturbance(report.lnight30);
  return {
    sensorId: report.sensorId,
    lnight30: report.lnight30,
    pctHighlySleepDisturbed: disturbance.percentHighlyDisturbed,
    nights: report.nights,
    outOfRange: disturbance.outOfRange,
    notEnoughData: false,
    indicative: true,
  };
}

/** Reads the 30-night rollup and writes it onto Mongo `sensors`. */
export async function refreshSensorLnight(deps: {
  repo: Pick<CityRepo, "lnight30" | "writeSensorLevels">;
  now?: Date;
}): Promise<number> {
  const now = deps.now ?? new Date();
  const levels = (await deps.repo.lnight30(now))
    .map(sensorLevelWrite)
    .sort((a, b) => a.sensorId.localeCompare(b.sensorId));
  await deps.repo.writeSensorLevels(levels);
  return levels.length;
}
