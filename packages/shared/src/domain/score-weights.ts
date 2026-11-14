// Quiet Stay Score inputs and weights per traveller profile (docs/BUSINESS.md).
// Weights are set in their own issue; the profile names are fixed here so routers can use them.
export const TRAVELLER_PROFILES = ["lightSleeper", "nightOut", "bestValue", "business"] as const;

export type TravellerProfile = (typeof TRAVELLER_PROFILES)[number];
