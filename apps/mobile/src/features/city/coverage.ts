import type { CityCoverage } from "@kip/shared/city";
import { SAY_SIMULATED } from "@kip/shared/domain";
import type { MapHeatPoint } from "@/lib/map";

// The Kip node network on the city map: where phones and Watches sensed, as rough heat.

/**
 * The weight of the lightest cell drawn, so it still shows. Real cells only reach the map once 3
 * or more people sensed there.
 */
const MIN_WEIGHT = 0.4;

/**
 * One heat point per cell centre, heavier where more people sensed. Real and simulated people are
 * scaled apart, each against its own busiest cell, so a large simulated cohort never pushes real
 * cells down. With simulated people hidden, only cells with real people are drawn.
 */
export function coverageHeat(cells: CityCoverage["cells"], showSimulated = true): MapHeatPoint[] {
  const maxReal = cells.reduce((top, cell) => Math.max(top, cell.people), 0);
  const maxSimulated = showSimulated
    ? cells.reduce((top, cell) => Math.max(top, cell.simulatedPeople), 0)
    : 0;
  const share = (cell: CityCoverage["cells"][number]) =>
    Math.max(
      maxReal > 0 ? cell.people / maxReal : 0,
      maxSimulated > 0 ? cell.simulatedPeople / maxSimulated : 0,
    );
  return cells
    .filter((cell) => share(cell) > 0)
    .map((cell) => ({
      position: [cell.lon, cell.lat],
      weight: MIN_WEIGHT + (1 - MIN_WEIGHT) * share(cell),
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
