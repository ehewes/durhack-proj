import type { CityCoverage } from "@kip/shared/city";
import { SAY_SIMULATED } from "@kip/shared/domain";
import type { MapHeatPoint } from "@/lib/map";

// The Kip node network on the city map: where phones and Watches sensed, as rough heat.

/** The lightest a cell gets, so an area one person sensed still shows. */
const MIN_WEIGHT = 0.4;

/** People counted in a cell: real ones, plus simulated ones while they are shown. */
const counted = (cell: CityCoverage["cells"][number], simulated: boolean) =>
  cell.people + (simulated ? cell.simulatedPeople : 0);

/**
 * One heat point per cell centre, heavier where more people sensed. With simulated people hidden,
 * only cells with real people are drawn.
 */
export function coverageHeat(cells: CityCoverage["cells"], showSimulated = true): MapHeatPoint[] {
  const shown = cells.filter((cell) => counted(cell, showSimulated) > 0);
  const most = shown.reduce((top, cell) => Math.max(top, counted(cell, showSimulated)), 0);
  if (most === 0) return [];
  return shown.map((cell) => ({
    position: [cell.lon, cell.lat],
    weight: MIN_WEIGHT + (1 - MIN_WEIGHT) * (counted(cell, showSimulated) / most),
  }));
}

export const COVERAGE_TITLE = "Kip node network";
export const SENSOR_DOTS = "Dots are Newcastle Urban Observatory sensors.";
export const SIMULATED_SWITCH = `Show ${SAY_SIMULATED} people`;

/** Whether the coverage has simulated people at all, so the switch only shows when it matters. */
export function hasSimulated(coverage: CityCoverage): boolean {
  return coverage.cells.some((cell) => cell.simulatedPeople > 0);
}

/** What the heat means, how rough it is, and whether simulated people are in it. */
export function coverageNotes(coverage: CityCoverage, showSimulated = true): string[] {
  const notes = [
    `Shading shows where Kip phones and Apple Watches sensed in the last ${coverage.days} nights, in areas about ${coverage.cellMeters} m across.`,
    `Real nights show only where ${coverage.minPeople} or more people sensed, and never where anyone was.`,
  ];
  if (!hasSimulated(coverage)) return notes;
  if (showSimulated) {
    notes.push(`Includes ${SAY_SIMULATED} people, not real users.`);
  } else {
    const real = coverage.cells.some((cell) => cell.people > 0);
    notes.push(
      real
        ? "Simulated people are hidden: real users only."
        : `Simulated people are hidden, and no area has ${coverage.minPeople} or more real users yet.`,
    );
  }
  return notes;
}
