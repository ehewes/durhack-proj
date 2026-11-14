import { z } from "zod";
import { TRAVELLER_PROFILES } from "../domain";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const travellerProfile = z.enum(TRAVELLER_PROFILES);

/** Input of `stays.rank`. `near` biases results to a point (a station, a venue). */
export const rankInput = z
  .object({
    profile: travellerProfile,
    checkIn: isoDate,
    checkOut: isoDate,
    near: point.optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });
export type RankInput = z.infer<typeof rankInput>;

/** One score input: 0 to 100 (higher is better for the stay), its profile weight, and what it adds. */
const component = z.object({
  value: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  points: z.number(),
});

/** Per-input breakdown (docs/BUSINESS.md, "Quiet Stay Score"). */
export const scoreBreakdown = z.object({
  noise: component,
  roadworks: component,
  airQuality: component,
  realNights: component,
  nightlife: component,
});
export type ScoreBreakdown = z.infer<typeof scoreBreakdown>;

/** What stands behind the score, one tap away in the UI. */
export const scoreSources = z.object({
  sensors: z.array(z.object({ id: z.string(), distanceM: z.number().nonnegative() })),
  permits: z.array(
    z.object({
      ref: z.string(),
      distanceM: z.number().nonnegative(),
      overlapsStay: z.boolean(),
      nightWork: z.boolean(),
    }),
  ),
  realNights: z.object({
    count: z.number().int().nonnegative(),
    simulated: z.boolean(),
  }),
});
export type ScoreSources = z.infer<typeof scoreSources>;

export const hotelScore = z.object({
  hotelId: z.string(),
  name: z.string(),
  location: point,
  pricePerNightGbp: z.number().positive().optional(),
  score: z.number().int().min(0).max(100),
  breakdown: scoreBreakdown,
  sources: scoreSources,
  /** Always true: the score is an indicative estimate and the UI says so. */
  estimate: z.literal(true),
  /** Placeholder until affiliate approval; never a real booking link. */
  bookingUrl: z.url(),
  /** True when simulated cohort nights affect the score. */
  simulated: z.boolean(),
});
export type HotelScore = z.infer<typeof hotelScore>;

export const rankResult = z.object({
  profile: travellerProfile,
  checkIn: isoDate,
  checkOut: isoDate,
  hotels: z.array(hotelScore),
});
export type RankResult = z.infer<typeof rankResult>;
