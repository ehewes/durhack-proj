import { isNightWork, type WorkGeometry, type WorkRecord, workRecord } from "@kip/shared/works";
import { bngToWgs84, type StreetManagerPermit } from "../../integrations/street-manager";

function point(lon: number, lat: number): WorkGeometry {
  return { type: "Point", coordinates: [lon, lat] };
}

function pairsFromWkt(
  wkt: string,
): { kind: "POINT" | "LINESTRING"; pairs: ReadonlyArray<readonly [number, number]> } | null {
  const trimmed = wkt.trim();
  const open = trimmed.indexOf("(");
  const close = trimmed.lastIndexOf(")");
  if (open < 0 || close !== trimmed.length - 1 || close <= open) return null;
  const kind = trimmed.slice(0, open).trim().toUpperCase();
  if (kind !== "POINT" && kind !== "LINESTRING") return null;
  const tokens = trimmed
    .slice(open + 1, close)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length === 0 || (kind === "POINT" && tokens.length !== 1)) return null;
  const pairs: Array<readonly [number, number]> = [];
  for (const token of tokens) {
    const parts = token.split(/\s+/).filter((part) => part.length > 0);
    const eastText = parts[0];
    const northText = parts[1];
    if (parts.length !== 2 || eastText === undefined || northText === undefined) return null;
    const easting = Number(eastText);
    const northing = Number(northText);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
    pairs.push([easting, northing]);
  }
  return { kind, pairs };
}

/** GeoJSON from the permit's British National Grid WKT. A bad WKT falls back to the representative point. */
export function geometryFromPermit(permit: StreetManagerPermit): WorkGeometry {
  const fallback = point(permit.location.lon, permit.location.lat);
  const parsed = pairsFromWkt(permit.location.wkt);
  if (!parsed) return fallback;
  const coordinates: Array<[number, number]> = [];
  for (const pair of parsed.pairs) {
    const easting = pair[0];
    const northing = pair[1];
    try {
      const wgs = bngToWgs84(easting, northing);
      coordinates.push([wgs.lon, wgs.lat]);
    } catch {
      return fallback;
    }
  }
  const first = coordinates[0];
  if (!first) return fallback;
  if (parsed.kind === "POINT") return point(first[0], first[1]);
  if (coordinates.length < 2) return fallback;
  return { type: "LineString", coordinates };
}

/** A parser permit, ready to store. `simulated` is set by the caller, not by Street Manager. */
export function permitToWork(
  permit: StreetManagerPermit,
  options: { simulated: boolean },
): WorkRecord {
  return workRecord.parse({
    permitReferenceNumber: permit.permitReferenceNumber,
    workReferenceNumber: permit.workReferenceNumber,
    eventReference: permit.eventReference,
    eventType: permit.eventType,
    eventTime: permit.eventTime,
    objectReference: permit.objectReference,
    highwayAuthority: permit.highwayAuthority,
    streetName: permit.streetName,
    town: permit.town,
    areaName: permit.areaName,
    workCategory: permit.workCategory,
    trafficManagementType: permit.trafficManagementType,
    currentTrafficManagementType: permit.currentTrafficManagementType,
    workStatus: permit.workStatus,
    proposedStart: permit.proposedStart,
    proposedEnd: permit.proposedEnd,
    actualStart: permit.actualStart,
    actualEnd: permit.actualEnd,
    nightWork: isNightWork(permit),
    simulated: options.simulated,
    geometry: geometryFromPermit(permit),
  });
}
