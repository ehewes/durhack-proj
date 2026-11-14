import { describe, expect, test } from "bun:test";
import {
  activeDates,
  intervalOverlapsNight,
  isInNewcastleArea,
  isNightWork,
  overlapsDates,
  type WorkSchedule,
  worksNearInput,
} from "./index";

const daytime: WorkSchedule = {
  proposedStart: { date: "2026-11-16T00:00:00.000Z", time: "2026-11-16T09:00:00.000Z" },
  proposedEnd: { date: "2026-11-16T00:00:00.000Z", time: "2026-11-16T18:30:00.000Z" },
  actualStart: null,
  actualEnd: null,
  trafficManagementType: "Lane closure",
  currentTrafficManagementType: null,
};

describe("Newcastle area", () => {
  test("keeps the city box and drops a London point", () => {
    expect(isInNewcastleArea(54.97, -1.61)).toBe(true);
    expect(isInNewcastleArea(51.5246596, -0.1685142)).toBe(false);
    expect(isInNewcastleArea(54.95, -1.61)).toBe(false);
    expect(isInNewcastleArea(55.05, -1.61)).toBe(false);
  });
});

describe("night work", () => {
  test("a proposed window that runs through the night is night work", () => {
    expect(
      intervalOverlapsNight(
        new Date("2026-11-15T22:00:00.000Z"),
        new Date("2026-11-16T18:30:00.000Z"),
      ),
    ).toBe(true);
    expect(
      intervalOverlapsNight(
        new Date("2026-11-15T22:00:00.000Z"),
        new Date("2026-11-16T07:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isNightWork({
        ...daytime,
        proposedStart: { date: "2026-11-15T00:00:00.000Z", time: "2026-11-15T22:00:00.000Z" },
        proposedEnd: { date: "2026-11-16T00:00:00.000Z", time: "2026-11-16T18:30:00.000Z" },
      }),
    ).toBe(true);
  });

  test("daytime proposed clocks are not night work", () => {
    expect(isNightWork(daytime)).toBe(false);
    expect(
      intervalOverlapsNight(
        new Date("2026-11-16T09:00:00.000Z"),
        new Date("2026-11-16T09:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      intervalOverlapsNight(
        new Date("2026-11-16T18:00:00.000Z"),
        new Date("2026-11-16T22:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("uses Europe/London, so BST and a set midnight both count", () => {
    expect(
      isNightWork({
        ...daytime,
        proposedEnd: { date: null, time: null },
        proposedStart: { date: "2026-07-01T00:00:00.000Z", time: "2026-07-01T22:30:00.000Z" },
      }),
    ).toBe(true);
    expect(
      isNightWork({
        ...daytime,
        proposedEnd: { date: null, time: null },
        proposedStart: { date: "2026-07-01T00:00:00.000Z", time: "2026-07-01T21:00:00.000Z" },
      }),
    ).toBe(false);
    expect(
      isNightWork({
        ...daytime,
        proposedStart: { date: "2026-11-19T00:00:00.000Z", time: "2026-11-19T00:00:00.000Z" },
        proposedEnd: { date: null, time: null },
      }),
    ).toBe(true);
  });

  test("a missing clock is not treated as midnight, and actual times do not set the flag", () => {
    expect(
      isNightWork({
        ...daytime,
        proposedStart: { date: "2026-11-19T00:00:00.000Z", time: null },
        proposedEnd: { date: "2026-11-19T00:00:00.000Z", time: null },
        actualStart: "2026-11-19T05:15:00.000Z",
        actualEnd: "2026-11-19T18:45:00.000Z",
      }),
    ).toBe(false);
  });

  test("a traffic management type that says night counts even in the daytime", () => {
    expect(isNightWork({ ...daytime, trafficManagementType: "Night-time working" })).toBe(true);
    expect(isNightWork({ ...daytime, currentTrafficManagementType: "Night working" })).toBe(true);
    expect(isNightWork({ ...daytime, trafficManagementType: "Fortnight closure" })).toBe(false);
  });
});

describe("active dates", () => {
  test("overlaps the stay and stops at an actual end", () => {
    expect(activeDates(daytime)).toEqual({ start: "2026-11-16", end: "2026-11-16" });
    expect(overlapsDates(daytime, "2026-11-16", "2026-11-16")).toBe(true);
    expect(overlapsDates(daytime, "2026-11-15", "2026-11-15")).toBe(false);

    const finished = {
      ...daytime,
      proposedEnd: { date: "2026-11-20T00:00:00.000Z", time: "2026-11-20T18:00:00.000Z" },
      actualEnd: "2026-11-16T12:00:00.000Z",
    };
    expect(activeDates(finished)).toEqual({ start: "2026-11-16", end: "2026-11-16" });
    expect(overlapsDates(finished, "2026-11-18", "2026-11-18")).toBe(false);
  });

  test("stays open when no end is known", () => {
    const open = {
      ...daytime,
      proposedEnd: { date: null, time: null },
    };
    expect(activeDates(open)).toEqual({ start: "2026-11-16", end: null });
    expect(overlapsDates(open, "2026-11-20", "2026-11-21")).toBe(true);
    expect(overlapsDates(open, "2026-11-14", "2026-11-15")).toBe(false);
  });

  test("a summer instant uses the London date", () => {
    const bst = {
      ...daytime,
      proposedStart: { date: null, time: "2026-07-15T23:30:00.000Z" },
      proposedEnd: { date: null, time: null },
      actualStart: null,
      actualEnd: null,
    };
    expect(activeDates(bst)?.start).toBe("2026-07-16");
  });
});

describe("worksNearInput", () => {
  test("defaults the radius to 200 metres and rejects a reversed range", () => {
    expect(
      worksNearInput.parse({ lat: 54.97, lon: -1.61, from: "2026-11-15", to: "2026-11-16" })
        .radiusM,
    ).toBe(200);
    expect(
      worksNearInput.safeParse({ lat: 54.97, lon: -1.61, from: "2026-11-16", to: "2026-11-15" })
        .success,
    ).toBe(false);
  });
});
