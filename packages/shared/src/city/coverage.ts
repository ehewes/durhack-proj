import { z } from "zod";
import { nightOf } from "../domain";

// Where Kip's own node network senses: phones on nightstands and Apple Watches on wrists. Only
// ever a rough area. Locations snap to a fixed grid of cells about 500 m across, real nights count
// only where several different people sensed, and a cell's centre is all that leaves the server.

/** A cell is about this many metres on a side in Newcastle. */
export const COVERAGE_CELL_M = 500;
/** A cell shows real nights only when at least this many different people sensed there. */
export const COVERAGE_MIN_PEOPLE = 3;
/** How many nights back the map counts. */
export const COVERAGE_DAYS = 30;

const M_PER_DEG_LAT = 111_320;
/** Longitude cells are sized at Newcastle's latitude, so cells are square there. */
const GRID_LAT = 55;
const LAT_STEP = COVERAGE_CELL_M / M_PER_DEG_LAT;
const LON_STEP = COVERAGE_CELL_M / (M_PER_DEG_LAT * Math.cos((GRID_LAT * Math.PI) / 180));

export const coverageCell = z.object({
  /** The cell's centre, never where anyone was */
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Different real people who sensed here. 0 when fewer than `minPeople`: their count is hidden */
  people: z.number().int().nonnegative(),
  /** Different simulated cohort people. Label them simulated wherever they show */
  simulatedPeople: z.number().int().nonnegative(),
});
export type CoverageCell = z.infer<typeof coverageCell>;

/** Output of the `city.coverage` query. */
export const cityCoverage = z.object({
  cellMeters: z.number().positive(),
  minPeople: z.number().int().positive(),
  days: z.number().int().positive(),
  cells: z.array(coverageCell),
});
export type CityCoverage = z.infer<typeof cityCoverage>;

/** Where one night was recorded. Server-side only: it never goes to the app as is. */
export type CoveragePoint = { userId: string; lat: number; lon: number; simulated: boolean };

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
const clamp = (value: number, limit: number) => Math.min(Math.max(value, -limit), limit);

/** A real place on Earth. Uploads accept any number, so a bad one must never reach a cell. */
function onEarth(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** The grid cell a location falls in: a stable key and the cell's centre. */
export function cellOf(lat: number, lon: number): { key: string; lat: number; lon: number } {
  const row = Math.floor(lat / LAT_STEP);
  const col = Math.floor(lon / LON_STEP);
  return {
    key: `${row}:${col}`,
    // Near a pole or the antimeridian a centre could fall just outside the valid range.
    lat: clamp(round6((row + 0.5) * LAT_STEP), 90),
    lon: clamp(round6((col + 0.5) * LON_STEP), 180),
  };
}

/** The first night the map counts: `COVERAGE_DAYS` nights back from the current one. */
export function coverageSince(now: Date): string {
  const day = new Date(`${nightOf(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (COVERAGE_DAYS - 1));
  return day.toISOString().slice(0, 10);
}

/**
 * Cells from night locations. Each person counts once per cell, however many nights they
 * recorded there. A cell's real people show only from `COVERAGE_MIN_PEOPLE` up; simulated people
 * are counted apart and always show, labelled. Cells come back sorted, not in arrival order.
 */
export function coverageFrom(points: readonly CoveragePoint[]): CityCoverage {
  const cells = new Map<
    string,
    { lat: number; lon: number; real: Set<string>; simulated: Set<string> }
  >();
  for (const point of points) {
    if (!onEarth(point.lat, point.lon)) continue;
    const cell = cellOf(point.lat, point.lon);
    const entry = cells.get(cell.key) ?? {
      lat: cell.lat,
      lon: cell.lon,
      real: new Set<string>(),
      simulated: new Set<string>(),
    };
    (point.simulated ? entry.simulated : entry.real).add(point.userId);
    cells.set(cell.key, entry);
  }
  const shown: CoverageCell[] = [];
  for (const entry of cells.values()) {
    const people = entry.real.size >= COVERAGE_MIN_PEOPLE ? entry.real.size : 0;
    if (people === 0 && entry.simulated.size === 0) continue;
    shown.push({ lat: entry.lat, lon: entry.lon, people, simulatedPeople: entry.simulated.size });
  }
  shown.sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  return {
    cellMeters: COVERAGE_CELL_M,
    minPeople: COVERAGE_MIN_PEOPLE,
    days: COVERAGE_DAYS,
    cells: shown,
  };
}
