import { SAY_INDICATIVE_ESTIMATE, SAY_SIMULATED } from "@kip/shared/domain";

export const TITLE = "Quiet stays";
export const INTRO = "Hotels in Newcastle ranked by how well you are likely to sleep there.";
export const PROFILE_TITLE = "Traveller profile";
export const DATES_TITLE = "Stay dates";
export const LIST_TITLE = "Ranked hotels";
export const LOADING = "Ranking hotels.";
export const EMPTY = "No hotels to rank for these dates.";
export const EMPTY_ACTION = "Reset the dates";
export const NO_SELECTION = "Select a hotel in the list or on the map to see its breakdown.";
/** Every score is an estimate of the surroundings, never of a room. */
export const ESTIMATE_LABEL = `Estimate: an ${SAY_INDICATIVE_ESTIMATE} of the area around the hotel, not of a room.`;
export const SAMPLE_LABEL = `Sample hotels, ${SAY_SIMULATED} data. The stays service is not reachable.`;
export const SAMPLE_STATION_NOTE =
  "Sample scores for this profile leave out station distance, which the sample does not hold.";
export const SIMULATED_NIGHTS = `Includes ${SAY_SIMULATED} cohort nights, not real people.`;
export const SOURCES_TITLE = "Sources";
export const BOOKING_NOTE = "Placeholder booking link, not a real booking.";
export const BOOKING_ACTION = "Open placeholder link";
export const NO_SENSORS = "No sensor within range, so the noise figure uses a city default.";

export const PROFILE_LABEL = {
  lightSleeper: "Light sleeper",
  nightOut: "Night out",
  bestValue: "Best value",
  business: "Business",
} as const;

export const INPUT_LABEL = {
  noise: "Night noise",
  roadworks: "Roadworks",
  airQuality: "Air quality",
  realNights: "Real nights",
  nightlife: "Nightlife and sights",
} as const;
