import type { WorksNearItem } from "@kip/shared/works";
import type { MapFeature, MapFeatureCollection, MapPosition } from "@/lib/map";
import {
  APPROXIMATE_LOCATION,
  NIGHT_NOT_SCHEDULED,
  NIGHT_SCHEDULED,
  NIGHT_UNKNOWN,
  SIMULATED_NOTE,
  SOURCE_NAME,
} from "./copy";

/** Marker colour for works a score points at. Matches the map accent. */
export const HIGHLIGHT_COLOR = "#2f5bd3";

const HIGHLIGHT_PREFIX = "highlight:";

/** A representative point: the point itself, the middle of a line, or a ring's mean. */
export function representativePoint(geometry: WorksNearItem["geometry"]): MapPosition {
  if (geometry.type === "Point") return geometry.coordinates;
  if (geometry.type === "LineString") {
    const { coordinates } = geometry;
    const upper = coordinates[Math.floor(coordinates.length / 2)];
    const lower = coordinates[Math.ceil(coordinates.length / 2) - 1];
    if (!upper || !lower) return coordinates[0] ?? [0, 0];
    return [(upper[0] + lower[0]) / 2, (upper[1] + lower[1]) / 2];
  }
  const ring = (geometry.coordinates[0] ?? []).slice(0, -1);
  if (ring.length === 0) return [0, 0];
  const lon = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const lat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  return [lon, lat];
}

/**
 * Map features for the permits. Stored lines and polygons are drawn as they are; a permit
 * that only has a point stays a point. Each permit in `highlightRefs` also gets an accent
 * marker, so Quiet Stays can show the works behind a score.
 */
export function worksFeatures(
  works: readonly WorksNearItem[],
  highlightRefs: readonly string[] = [],
): MapFeatureCollection {
  const highlighted = new Set(highlightRefs);
  const features: MapFeature[] = [];
  for (const work of works) {
    const marked = highlighted.has(work.permitReferenceNumber);
    features.push({
      type: "Feature",
      id: work.permitReferenceNumber,
      geometry: work.geometry,
      properties: {
        nightWork: work.nightWork,
        precision: work.precision,
        ...(marked && work.geometry.type === "Point" ? { color: HIGHLIGHT_COLOR } : {}),
      },
    });
    if (marked && work.geometry.type !== "Point") {
      features.push({
        type: "Feature",
        id: `${HIGHLIGHT_PREFIX}${work.permitReferenceNumber}`,
        geometry: { type: "Point", coordinates: representativePoint(work.geometry) },
        properties: { color: HIGHLIGHT_COLOR },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** The permit reference behind a map feature id, whether it is the works or its highlight marker. */
export function permitRefOfFeature(id: string): string {
  return id.startsWith(HIGHLIGHT_PREFIX) ? id.slice(HIGHLIGHT_PREFIX.length) : id;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** A date with its clock time when there is one, in Europe/London. Null when neither is known. */
export function formatWhen(clock: { date: string | null; time: string | null }): string | null {
  const instant = clock.time ? new Date(clock.time) : null;
  if (instant && !Number.isNaN(instant.getTime())) {
    return `${dateFormat.format(instant)}, ${timeFormat.format(instant)}`;
  }
  if (clock.date) {
    const day = new Date(`${clock.date}T12:00:00Z`);
    if (!Number.isNaN(day.getTime())) return dateFormat.format(day);
  }
  return null;
}

export function nightLabel(status: WorksNearItem["nightWork"]): string {
  if (status === "scheduled") return NIGHT_SCHEDULED;
  if (status === "not_scheduled") return NIGHT_NOT_SCHEDULED;
  return NIGHT_UNKNOWN;
}

export type WorkRow = { label: string; value: string };

export type WorkDetails = {
  title: string;
  rows: WorkRow[];
  /** Disclosures shown under the rows, in order. */
  notes: string[];
};

function rowOf(label: string, value: string | null): WorkRow | null {
  return value ? { label, value } : null;
}

/** What the details panel shows for one permit. Missing dates are omitted, never guessed. */
export function describeWork(work: WorksNearItem): WorkDetails {
  const candidates: (WorkRow | null)[] = [
    { label: "Source", value: `${SOURCE_NAME} ${work.permitReferenceNumber}` },
    { label: "Authority", value: work.highwayAuthority },
    { label: "Category", value: work.workCategory },
    rowOf("Status", work.workStatus),
    rowOf("Proposed start", formatWhen(work.proposedStart)),
    rowOf("Proposed end", formatWhen(work.proposedEnd)),
    rowOf("Actual start", formatWhen({ date: null, time: work.actualStart })),
    rowOf("Actual end", formatWhen({ date: null, time: work.actualEnd })),
    { label: "Night work", value: nightLabel(work.nightWork) },
  ];
  const notes: string[] = [];
  if (work.precision === "point") notes.push(APPROXIMATE_LOCATION);
  if (work.simulated) notes.push(SIMULATED_NOTE);
  return {
    title: work.streetName,
    rows: candidates.filter((row): row is WorkRow => row !== null),
    notes,
  };
}
