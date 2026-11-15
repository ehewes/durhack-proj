import type { AccountView } from "@kip/shared/account";
import {
  type CityCoverage,
  type CoveragePoint,
  coverageFrom,
  coverageSince,
  type SensorLevel,
} from "@kip/shared/city";
import { MIN_NIGHTS_FOR_ESTIMATE, roadTrafficDisturbance } from "@kip/shared/domain";
import type { CityRepo, SensorDocument, SensorLevelWrite, SensorLnightReport } from "./repo";

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

/**
 * One map pin from a Mongo sensor. Fewer than 30 nights, or a missing
 * estimate, comes back as not enough data with nothing to shade.
 * GeoJSON stores `[longitude, latitude]`.
 */
export function sensorLevelFromDocument(doc: SensorDocument): SensorLevel {
  const [lon, lat] = doc.location.coordinates;
  const nights = doc.nights ?? 0;
  const lnight30 = doc.lnight30 ?? null;
  const pctHighlySleepDisturbed = doc.pctHighlySleepDisturbed ?? null;
  const updatedAt = doc.updatedAt.toISOString();
  const unshaded =
    nights < MIN_NIGHTS_FOR_ESTIMATE ||
    doc.notEnoughData === true ||
    lnight30 === null ||
    pctHighlySleepDisturbed === null;
  if (unshaded) {
    return {
      id: doc._id,
      name: doc.name,
      lat,
      lon,
      lnight30: null,
      nights,
      pctHighlySleepDisturbed: null,
      outOfRange: false,
      notEnoughData: true,
      indicative: true,
      updatedAt,
    };
  }
  return {
    id: doc._id,
    name: doc.name,
    lat,
    lon,
    lnight30,
    nights,
    pctHighlySleepDisturbed,
    outOfRange: doc.outOfRange === true,
    notEnoughData: false,
    indicative: true,
    updatedAt,
  };
}

/** Reads Mongo `sensors` into the shared city-map payload. */
export async function listCitySensors(repo: Pick<CityRepo, "listSensors">): Promise<SensorLevel[]> {
  const levels = (await repo.listSensors()).map(sensorLevelFromDocument);
  levels.sort((a, b) => a.id.localeCompare(b.id));
  return levels;
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

/**
 * Night locations whose person still allows location now. A real user counts only while their
 * account says yes (an unanswered account is a no), however their nights were stored. Simulated
 * people have no account and pass as they are. Each real user is looked up once.
 */
export async function keepCurrentConsent(
  points: readonly CoveragePoint[],
  accountOf: (userId: string) => Promise<AccountView>,
): Promise<CoveragePoint[]> {
  const real = [...new Set(points.filter((p) => !p.simulated).map((p) => p.userId))];
  const allowed = new Set<string>();
  await Promise.all(
    real.map(async (userId) => {
      const view = await accountOf(userId);
      if (view.consentUpdatedAt !== null && view.consent.location) allowed.add(userId);
    }),
  );
  return points.filter((point) => point.simulated || allowed.has(point.userId));
}

/** `city.coverage`: night locations since the window start, current consent applied, as cells. */
export async function computeCoverage(deps: {
  locate: (since: string) => Promise<CoveragePoint[]>;
  accountOf: (userId: string) => Promise<AccountView>;
  now: Date;
}): Promise<CityCoverage> {
  const points = await deps.locate(coverageSince(deps.now));
  return coverageFrom(await keepCurrentConsent(points, deps.accountOf));
}
