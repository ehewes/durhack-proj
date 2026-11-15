import { describe, expect, test } from "bun:test";
import type { CityCoverage } from "@kip/shared/city";
import { bannedWording } from "@kip/shared/domain";
import {
  COVERAGE_TITLE,
  coverageHeat,
  coverageNotes,
  hasSimulated,
  SENSOR_DOTS,
  SIMULATED_SWITCH,
} from "./coverage";

const coverage = (cells: CityCoverage["cells"]): CityCoverage => ({
  cellMeters: 500,
  minPeople: 3,
  days: 30,
  cells,
});

describe("node-network heat", () => {
  test("one point per cell centre, heavier where more people sensed", () => {
    expect(
      coverageHeat([
        { lat: 54.97, lon: -1.61, people: 4, simulatedPeople: 0 },
        { lat: 54.98, lon: -1.62, people: 0, simulatedPeople: 1 },
      ]),
    ).toEqual([
      { position: [-1.61, 54.97], weight: 1 },
      { position: [-1.62, 54.98], weight: 0.55 },
    ]);
    expect(coverageHeat([])).toEqual([]);
  });

  test("with simulated people switched off, only real cells are drawn", () => {
    const cells = [
      { lat: 54.97, lon: -1.61, people: 3, simulatedPeople: 2 },
      { lat: 54.98, lon: -1.62, people: 0, simulatedPeople: 4 },
    ];
    expect(coverageHeat(cells, false)).toEqual([{ position: [-1.61, 54.97], weight: 1 }]);
    expect(coverageHeat(cells, true)).toHaveLength(2);
    expect(
      coverageHeat([{ lat: 54.98, lon: -1.62, people: 0, simulatedPeople: 4 }], false),
    ).toEqual([]);
  });

  test("the switch shows only with simulated people, and says when they are hidden", () => {
    const onlySimulated = coverage([{ lat: 54.97, lon: -1.61, people: 0, simulatedPeople: 2 }]);
    expect(hasSimulated(onlySimulated)).toBe(true);
    expect(
      hasSimulated(coverage([{ lat: 54.97, lon: -1.61, people: 3, simulatedPeople: 0 }])),
    ).toBe(false);
    const hidden = coverageNotes(onlySimulated, false);
    expect(hidden.some((note) => note.includes("no area has 3 or more real users"))).toBe(true);
    expect(hidden.some((note) => note.includes("not real users"))).toBe(false);
    const mixed = coverage([{ lat: 54.97, lon: -1.61, people: 3, simulatedPeople: 1 }]);
    expect(coverageNotes(mixed, false).at(-1)).toBe(
      "Simulated people are hidden: real users only.",
    );
    for (const line of [SIMULATED_SWITCH, ...hidden]) {
      expect(bannedWording(line, "cohort")).toEqual([]);
    }
    for (const line of [SIMULATED_SWITCH, hidden.at(-1) ?? ""]) {
      expect(line.toLowerCase().includes("simulated")).toBe(true);
    }
  });

  test("labels simulated people only when they are on the map, within the wording rules", () => {
    const real = coverageNotes(
      coverage([{ lat: 54.97, lon: -1.61, people: 3, simulatedPeople: 0 }]),
    );
    expect(real.some((note) => note.includes("simulated"))).toBe(false);
    const simulated = coverageNotes(
      coverage([{ lat: 54.97, lon: -1.61, people: 0, simulatedPeople: 2 }]),
    );
    expect(simulated.some((note) => note.includes("simulated"))).toBe(true);
    for (const line of [COVERAGE_TITLE, SENSOR_DOTS, ...simulated]) {
      expect(bannedWording(line, "cohort")).toEqual([]);
      expect(bannedWording(line, "city")).toEqual([]);
      expect(line.includes("—")).toBe(false);
    }
  });
});
