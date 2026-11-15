import type { CityCoverage } from "@kip/shared/city";
import { SAY_SIMULATED } from "@kip/shared/domain";
import type { MapHeatPoint } from "@/lib/map";

// The Kip node network on the city map: where phones and Watches sensed, as rough heat.

/** The lightest a cell gets, so an area one person sensed still shows. */
const MIN_WEIGHT = 0.4;

/** One heat point per cell centre, heavier where more people sensed, real or simulated. */
export function coverageHeat(cells: CityCoverage["cells"]): MapHeatPoint[] {
  const most = cells.reduce((top, cell) => Math.max(top, cell.people + cell.simulatedPeople), 0);
  if (most === 0) return [];
  return cells.map((cell) => ({
    position: [cell.lon, cell.lat],
    weight: MIN_WEIGHT + (1 - MIN_WEIGHT) * ((cell.people + cell.simulatedPeople) / most),
  }));
}

export const COVERAGE_TITLE = "Kip node network";
export const SENSOR_DOTS = "Dots are Newcastle Urban Observatory sensors.";

/** What the heat means, how rough it is, and whether simulated people are in it. */
export function coverageNotes(coverage: CityCoverage): string[] {
  const notes = [
    `Shading shows where Kip phones and Apple Watches sensed in the last ${coverage.days} nights, in areas about ${coverage.cellMeters} m across.`,
    `Real nights show only where ${coverage.minPeople} or more people sensed, and never where anyone was.`,
  ];
  if (coverage.cells.some((cell) => cell.simulatedPeople > 0)) {
    notes.push(`Includes ${SAY_SIMULATED} people, not real users.`);
  }
  return notes;
}
