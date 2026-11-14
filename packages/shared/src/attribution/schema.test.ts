import { describe, expect, test } from "bun:test";
import { bannedWording, MIN_NIGHTS_FOR_PERCENTAGE } from "../domain";
import { toAttributionView } from "./schema";

const night = { wakeUps: 4, followedSpike: 3 };

describe("toAttributionView", () => {
  test("one night is a count, in the domain's words", () => {
    const view = toAttributionView([night]);
    expect(view).toEqual({
      display: "counts",
      nightsPooled: 1,
      wakeUps: 4,
      followedSpike: 3,
      text: "3 of 4 wake-ups followed a spike",
    });
    expect(bannedWording(view.text, "cause")).toEqual([]);
  });

  test("a single wake-up stays singular", () => {
    expect(toAttributionView([{ wakeUps: 1, followedSpike: 1 }]).text).toBe(
      "1 of 1 wake-up followed a spike",
    );
  });

  test("stays on counts below the pooled-night constant", () => {
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE - 1 }, () => night);
    const view = toAttributionView(nights);
    expect(view.display).toBe("counts");
    expect(view).toMatchObject({
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE - 1,
      wakeUps: 4 * (MIN_NIGHTS_FOR_PERCENTAGE - 1),
      followedSpike: 3 * (MIN_NIGHTS_FOR_PERCENTAGE - 1),
    });
    expect(view.text).toBe(
      `${3 * (MIN_NIGHTS_FOR_PERCENTAGE - 1)} of ${4 * (MIN_NIGHTS_FOR_PERCENTAGE - 1)} wake-ups followed a spike`,
    );
  });

  test("shows a percentage only once enough nights are pooled", () => {
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE }, () => night);
    const view = toAttributionView(nights);
    expect(view).toEqual({
      display: "percentage",
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE,
      wakeUps: 4 * MIN_NIGHTS_FOR_PERCENTAGE,
      followedSpike: 3 * MIN_NIGHTS_FOR_PERCENTAGE,
      percent: 75,
      text: "75% of wake-ups followed a spike",
    });
    expect(bannedWording(view.text, "cause")).toEqual([]);
  });

  test("no wake-ups stay counts even when enough nights are pooled", () => {
    const quiet = { wakeUps: 0, followedSpike: 0 };
    const nights = Array.from({ length: MIN_NIGHTS_FOR_PERCENTAGE }, () => quiet);
    expect(toAttributionView(nights)).toEqual({
      display: "counts",
      nightsPooled: MIN_NIGHTS_FOR_PERCENTAGE,
      wakeUps: 0,
      followedSpike: 0,
      text: "0 of 0 wake-ups followed a spike",
    });
  });
});
