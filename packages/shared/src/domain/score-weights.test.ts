import { describe, expect, test } from "bun:test";
import {
  type HotelScore,
  type HotelScoreInputs,
  MIN_REAL_NIGHTS,
  NIGHT_WORK_MULTIPLIER,
  REAL_NIGHTS_RADIUS_M,
  SCORE_INPUTS,
  SCORE_WEIGHTS,
  scoreHotel,
  TRAVELLER_PROFILES,
  type TravellerProfile,
  WORKS_RADIUS_M,
} from "./score-weights";
import { bannedWording } from "./wording";

const WEEKNIGHTS = ["2026-11-16", "2026-11-17", "2026-11-18"]; // Mon to Wed
const WEEKEND = ["2026-11-20", "2026-11-21"]; // Fri and Sat

function baseInputs(overrides: Partial<HotelScoreInputs> = {}): HotelScoreInputs {
  return {
    lnightDb: 50,
    stayDates: WEEKNIGHTS,
    pricePerNightGbp: 100,
    ...overrides,
  };
}

function explained(result: HotelScore): number {
  const raw = SCORE_INPUTS.reduce((sum, input) => sum + result.breakdown[input].points, 0);
  return Math.min(100, Math.max(0, raw));
}

function weightSum(profile: TravellerProfile): number {
  const weights = SCORE_WEIGHTS[profile];
  return (
    weights.noise +
    weights.roadworks +
    weights.airQuality +
    weights.realNights +
    weights.nightlife +
    weights.sights +
    weights.station
  );
}

describe("scoreHotel", () => {
  test("profiles are the four traveller questions", () => {
    expect(TRAVELLER_PROFILES).toEqual(["lightSleeper", "nightOut", "bestValue", "business"]);
    for (const profile of TRAVELLER_PROFILES) {
      expect(SCORE_WEIGHTS[profile].noise).toBeGreaterThan(0);
    }
    expect(SCORE_WEIGHTS.bestValue.perPound).toBe(true);
    expect(SCORE_WEIGHTS.lightSleeper.perPound).toBe(false);
    for (const profile of TRAVELLER_PROFILES) {
      expect(weightSum(profile)).toBeCloseTo(1, 8);
      expect(SCORE_WEIGHTS[profile].station).toBeGreaterThanOrEqual(
        SCORE_WEIGHTS[profile].weeknightNoise,
      );
      expect(SCORE_WEIGHTS[profile].noise).toBeGreaterThan(SCORE_WEIGHTS[profile].airQuality);
    }
  });

  test("returns 0 to 100 with one breakdown line per input", () => {
    const result = scoreHotel(
      baseInputs({ lnightDb: 90, airQuality: { pm25: 80, no2: 80 } }),
      "lightSleeper",
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.indicative).toBe(true);
    expect(SCORE_INPUTS.map((input) => result.breakdown[input].input)).toEqual([...SCORE_INPUTS]);
    expect(result.score).toBeCloseTo(explained(result), 8);
  });

  test("the score falls as noise rises, for every profile", () => {
    for (const profile of TRAVELLER_PROFILES) {
      const quiet = scoreHotel(baseInputs({ lnightDb: 45 }), profile).score;
      const mid = scoreHotel(baseInputs({ lnightDb: 55 }), profile).score;
      const loud = scoreHotel(baseInputs({ lnightDb: 60 }), profile).score;
      expect(mid).toBeLessThan(quiet);
      expect(loud).toBeLessThan(mid);
    }
  });

  test("disturbance moves a light sleeper more than air quality or a full works penalty", () => {
    const calm = scoreHotel(baseInputs({ lnightDb: 45 }), "lightSleeper").score;
    const loud = scoreHotel(baseInputs({ lnightDb: 65 }), "lightSleeper").score;
    const noiseDrop = calm - loud;
    const weights = SCORE_WEIGHTS.lightSleeper;
    expect(noiseDrop).toBeGreaterThan(weights.airQuality * 100);
    expect(noiseDrop).toBeGreaterThan(weights.roadworks * 100);
  });

  test("roadworks count only on the stay dates, inside 200 m, and night work weighs more", () => {
    const none = scoreHotel(baseInputs(), "lightSleeper").score;
    const outsideStay = scoreHotel(
      baseInputs({
        works: [{ distanceM: 40, activeDates: ["2026-11-21"], nightWork: true }],
      }),
      "lightSleeper",
    ).score;
    const tooFar = scoreHotel(
      baseInputs({
        works: [{ distanceM: WORKS_RADIUS_M + 1, activeDates: WEEKNIGHTS, nightWork: true }],
      }),
      "lightSleeper",
    ).score;
    const onTheRadius = scoreHotel(
      baseInputs({
        works: [{ distanceM: WORKS_RADIUS_M, activeDates: WEEKNIGHTS, nightWork: false }],
      }),
      "lightSleeper",
    ).score;
    const daytime = scoreHotel(
      baseInputs({
        works: [{ distanceM: 40, activeDates: WEEKNIGHTS, nightWork: false }],
      }),
      "lightSleeper",
    ).score;
    const night = scoreHotel(
      baseInputs({
        works: [{ distanceM: 40, activeDates: WEEKNIGHTS, nightWork: true }],
      }),
      "lightSleeper",
    ).score;
    const oneNight = scoreHotel(
      baseInputs({
        works: [{ distanceM: 40, activeDates: ["2026-11-16", "2026-12-01"], nightWork: false }],
      }),
      "lightSleeper",
    ).score;
    const duplicatedDate = scoreHotel(
      baseInputs({
        works: [{ distanceM: 40, activeDates: ["2026-11-16", "2026-11-16"], nightWork: false }],
      }),
      "lightSleeper",
    ).score;

    expect(outsideStay).toBeCloseTo(none, 8);
    expect(tooFar).toBeCloseTo(none, 8);
    expect(onTheRadius).toBeLessThan(none);
    expect(daytime).toBeLessThan(none);
    expect(night).toBeLessThan(daytime);
    expect(none - night).toBeCloseTo((none - daytime) * NIGHT_WORK_MULTIPLIER, 8);
    expect(oneNight).toBeGreaterThan(daytime);
    expect(oneNight).toBeLessThan(none);
    expect(duplicatedDate).toBeCloseTo(oneNight, 8);
  });

  test("air quality is a small factor", () => {
    const clean = scoreHotel(baseInputs(), "lightSleeper").score;
    const dirty = scoreHotel(
      baseInputs({ airQuality: { pm25: 80, no2: 80 } }),
      "lightSleeper",
    ).score;
    const loud = scoreHotel(baseInputs({ lnightDb: 65 }), "lightSleeper").score;
    expect(dirty).toBeLessThan(clean);
    expect(clean - dirty).toBeLessThanOrEqual(SCORE_WEIGHTS.lightSleeper.airQuality * 100 + 1e-9);
    expect(clean - dirty).toBeLessThan(clean - loud);
  });

  test("real nights within 300 m correct the estimate only once there are enough", () => {
    const sensor = scoreHotel(baseInputs({ lnightDb: 45 }), "lightSleeper");
    const almost = Array.from({ length: MIN_REAL_NIGHTS - 1 }, () => ({
      distanceM: 100,
      disturbancePercent: 12,
    }));
    const notYet = scoreHotel(baseInputs({ lnightDb: 45, realNights: almost }), "lightSleeper");
    expect(notYet.score).toBeCloseTo(sensor.score, 8);
    expect(notYet.simulated).toBe(false);

    const enough = [...almost, { distanceM: REAL_NIGHTS_RADIUS_M, disturbancePercent: 12 }];
    const corrected = scoreHotel(baseInputs({ lnightDb: 45, realNights: enough }), "lightSleeper");
    expect(corrected.score).toBeLessThan(sensor.score);
    expect(corrected.simulated).toBe(false);

    const oneTooFar = [...almost, { distanceM: REAL_NIGHTS_RADIUS_M + 1, disturbancePercent: 12 }];
    const ignored = scoreHotel(baseInputs({ lnightDb: 45, realNights: oneTooFar }), "lightSleeper");
    expect(ignored.score).toBeCloseTo(sensor.score, 8);

    const quieter = Array.from({ length: MIN_REAL_NIGHTS }, () => ({
      distanceM: 80,
      disturbancePercent: 1,
    }));
    const improved = scoreHotel(baseInputs({ lnightDb: 60, realNights: quieter }), "lightSleeper");
    const loud = scoreHotel(baseInputs({ lnightDb: 60 }), "lightSleeper");
    expect(improved.score).toBeGreaterThan(loud.score);
  });

  test("simulated nights are labelled when they change the score", () => {
    const nights = Array.from({ length: MIN_REAL_NIGHTS }, () => ({
      distanceM: 120,
      disturbancePercent: 12,
      simulated: true,
    }));
    const result = scoreHotel(baseInputs({ lnightDb: 45, realNights: nights }), "bestValue");
    expect(result.simulated).toBe(true);
    const line = result.breakdown.realNights;
    expect(line.simulated).toBe(true);
    expect(line.detail.toLowerCase()).toContain("simulated");
    expect(bannedWording(line.detail)).toEqual([]);
  });

  test("switching profile reorders a fixed hotel set", () => {
    const stayDates = WEEKNIGHTS;
    const hotels: { name: string; inputs: HotelScoreInputs }[] = [
      {
        name: "quietCourt",
        inputs: {
          lnightDb: 45,
          stayDates,
          nightlifeDistanceM: 1200,
          sightsDistanceM: 500,
          pricePerNightGbp: 180,
          stationDistanceM: 1500,
        },
      },
      {
        name: "quayside",
        inputs: {
          lnightDb: 58,
          stayDates,
          nightlifeDistanceM: 100,
          sightsDistanceM: 150,
          pricePerNightGbp: 115,
          stationDistanceM: 450,
        },
      },
      {
        name: "stationInn",
        inputs: {
          lnightDb: 62,
          stayDates,
          nightlifeDistanceM: 750,
          sightsDistanceM: 1000,
          pricePerNightGbp: 65,
          stationDistanceM: 100,
        },
      },
    ];

    function ranking(profile: TravellerProfile): string[] {
      return hotels
        .map((hotel) => ({ name: hotel.name, score: scoreHotel(hotel.inputs, profile).score }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map((hotel) => hotel.name);
    }

    const order: Record<TravellerProfile, string[]> = {
      lightSleeper: ranking("lightSleeper"),
      nightOut: ranking("nightOut"),
      bestValue: ranking("bestValue"),
      business: ranking("business"),
    };

    expect(order.lightSleeper).toEqual(["quietCourt", "quayside", "stationInn"]);
    expect(order.nightOut).toEqual(["quayside", "quietCourt", "stationInn"]);
    expect(order.bestValue).toEqual(["stationInn", "quayside", "quietCourt"]);
    expect(order.business).toEqual(["quietCourt", "stationInn", "quayside"]);
    expect(new Set(Object.values(order).map((names) => names.join(">"))).size).toBe(4);
  });

  test("nightlife is a preference, so only profiles that weight it move", () => {
    const near = baseInputs({ nightlifeDistanceM: 100, sightsDistanceM: 400 });
    const far = baseInputs({ nightlifeDistanceM: 2000, sightsDistanceM: 400 });
    expect(scoreHotel(near, "nightOut").score).toBeGreaterThan(scoreHotel(far, "nightOut").score);
    expect(scoreHotel(near, "lightSleeper").score).toBeCloseTo(
      scoreHotel(far, "lightSleeper").score,
      8,
    );
    for (const profile of TRAVELLER_PROFILES) {
      expect(SCORE_WEIGHTS[profile].nightlife).toBeGreaterThanOrEqual(0);
      expect(SCORE_WEIGHTS[profile].sights).toBeGreaterThanOrEqual(0);
    }
  });

  test("best value is quiet points per pound, and other profiles ignore price", () => {
    const cheap = baseInputs({ pricePerNightGbp: 70 });
    const dear = baseInputs({ pricePerNightGbp: 180 });
    expect(scoreHotel(cheap, "bestValue").score).toBeGreaterThan(
      scoreHotel(dear, "bestValue").score,
    );
    expect(scoreHotel(cheap, "lightSleeper").score).toBeCloseTo(
      scoreHotel(dear, "lightSleeper").score,
      8,
    );
    const unpriced = scoreHotel(baseInputs({ pricePerNightGbp: undefined }), "bestValue");
    const reference = scoreHotel(baseInputs({ pricePerNightGbp: 100 }), "bestValue");
    expect(unpriced.score).toBeCloseTo(reference.score, 8);
  });

  test("business ranks the station, and weeknights prefer a quieter hotel", () => {
    const near = scoreHotel(baseInputs({ stationDistanceM: 80 }), "business").score;
    const far = scoreHotel(baseInputs({ stationDistanceM: 2000 }), "business").score;
    expect(near).toBeGreaterThan(far);
    expect(scoreHotel(baseInputs({ stationDistanceM: 80 }), "lightSleeper").score).toBeCloseTo(
      scoreHotel(baseInputs({ stationDistanceM: 2000 }), "lightSleeper").score,
      8,
    );

    const quiet = { lnightDb: 45, stationDistanceM: 2000, pricePerNightGbp: 100 };
    const loudNear = { lnightDb: 62, stationDistanceM: 100, pricePerNightGbp: 100 };
    const weekendQuiet = scoreHotel({ ...quiet, stayDates: WEEKEND }, "business").score;
    const weekendLoud = scoreHotel({ ...loudNear, stayDates: WEEKEND }, "business").score;
    const weekQuiet = scoreHotel({ ...quiet, stayDates: WEEKNIGHTS }, "business").score;
    const weekLoud = scoreHotel({ ...loudNear, stayDates: WEEKNIGHTS }, "business").score;
    expect(weekendLoud).toBeGreaterThan(weekendQuiet);
    expect(weekQuiet).toBeGreaterThan(weekLoud);
    expect(scoreHotel({ ...loudNear, stayDates: WEEKNIGHTS }, "nightOut").score).toBeCloseTo(
      scoreHotel({ ...loudNear, stayDates: WEEKEND }, "nightOut").score,
      8,
    );
  });

  test("breakdown copy stays inside the wording rules", () => {
    const nights = Array.from({ length: MIN_REAL_NIGHTS }, () => ({
      distanceM: 50,
      disturbancePercent: 11,
      simulated: true,
    }));
    const inputs = baseInputs({
      lnightDb: 70,
      works: [{ distanceM: 30, activeDates: WEEKNIGHTS, nightWork: true }],
      airQuality: { no2: 30, pm25: 20 },
      realNights: nights,
      nightlifeDistanceM: 120,
      sightsDistanceM: 200,
      stationDistanceM: 250,
      pricePerNightGbp: 90,
    });
    for (const profile of TRAVELLER_PROFILES) {
      const result = scoreHotel(inputs, profile);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeCloseTo(explained(result), 8);
      for (const input of SCORE_INPUTS) {
        expect(bannedWording(result.breakdown[input].detail)).toEqual([]);
      }
    }
  });
});
