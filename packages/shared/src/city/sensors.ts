import { z } from "zod";

/**
 * One Newcastle Urban Observatory noise sensor on the city map.
 * Figures are an indicative road-traffic estimate, never a measured disturbance rate
 * (`docs/DOMAIN.md`).
 */
export const sensorLevel = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /** Energy average of nightly Lnight in dB; null when there is not enough data */
    lnight30: z.number().nullable(),
    /** Nights of data behind the estimate */
    nights: z.number().int().nonnegative(),
    /** Indicative % highly sleep disturbed from the WHO curve; null when there is not enough data */
    pctHighlySleepDisturbed: z.number().nullable(),
    /** Lnight fell outside 40 to 65 dB and was clamped for the estimate */
    outOfRange: z.boolean(),
    /** Fewer than 30 nights: show the sensor but don't shade it */
    notEnoughData: z.boolean(),
    indicative: z.literal(true),
    /** ISO 8601 timestamp of the latest reading used */
    updatedAt: z.iso.datetime(),
  })
  .refine((s) => !s.notEnoughData || (s.lnight30 === null && s.pctHighlySleepDisturbed === null), {
    message: "a sensor without enough data has no Lnight or %HSD",
  })
  .refine((s) => s.notEnoughData || (s.lnight30 !== null && s.pctHighlySleepDisturbed !== null), {
    message: "a sensor with enough data needs Lnight and %HSD",
  });
export type SensorLevel = z.infer<typeof sensorLevel>;

/** Output of the city sensors query. */
export const citySensors = z.array(sensorLevel);
export type CitySensors = z.infer<typeof citySensors>;
