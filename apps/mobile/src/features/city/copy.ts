import { SAY_SIMULATED } from "@kip/shared/domain";

export const TITLE = "Kip Map";
/** The label every selected sensor carries (`docs/DOMAIN.md`: Wording rules). */
export const ESTIMATE_LABEL = "indicative road-traffic estimate, WHO curve";
export const SHADE_KEY_TITLE = "Highly sleep disturbed, indicative";
export const CLUSTER_NOTE =
  "Numbered circles count sensors in that spot. They are not an average and do not cover an area. Zoom in to see each sensor.";
export const UNSHADED_NOTE =
  "Not shaded: fewer than 30 nights, no readings, or a latest reading over 3 days old. Select a sensor to see which.";
export const LIST_TITLE = "Sensors";
export const LOADING = "Loading sensors.";
export const SAMPLE_LABEL = `Sample sensors, ${SAY_SIMULATED} data. The city service is not reachable.`;
export const CLAMP_NOTE =
  "Lnight is outside the WHO curve's 40 to 65 dB range, so the estimate uses the nearest end of the range.";
export const NO_SELECTION = "Select a sensor on the map or in the list to see its details.";
export const SOURCE = "Newcastle Urban Observatory";

export const STATE_NOTE = {
  shaded: "",
  outOfRange: CLAMP_NOTE,
  fewNights: "Fewer than 30 nights of data, so this sensor is not shaded.",
  missing: "No readings yet, so this sensor is not shaded.",
  stale: "The latest reading is more than 3 days old, so this sensor is not shaded.",
} as const;

export const STATE_LABEL = {
  shaded: "Shaded",
  outOfRange: "Shaded, clamped",
  fewNights: "Under 30 nights",
  missing: "No readings",
  stale: "Out of date",
} as const;
