import { z } from "zod";
import { TRAVELLER_PROFILES } from "../domain";

const count = z.number().int().nonnegative();

/** One explicit choice per data type (docs/DOMAIN.md, Privacy). */
export const consentChoices = z.object({
  microphone: z.boolean(),
  health: z.boolean(),
  location: z.boolean(),
});

export type ConsentChoices = z.infer<typeof consentChoices>;

/** Until a user answers, every data type is off. */
export const NO_CONSENT: Readonly<ConsentChoices> = Object.freeze({
  microphone: false,
  health: false,
  location: false,
});

export const travellerProfile = z.enum(TRAVELLER_PROFILES);

export const setConsentInput = consentChoices;
export type SetConsentInput = z.infer<typeof setConsentInput>;

export const setProfileInput = z.object({ profile: travellerProfile });
export type SetProfileInput = z.infer<typeof setProfileInput>;

/** `account.me`. A user who has never answered gets every consent off and no profile. */
export const accountView = z.object({
  userId: z.uuid(),
  consent: consentChoices,
  /** When the user last made their consent choices. Null until they answer the first time */
  consentUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Quiet Stays profile. Null until chosen */
  profile: travellerProfile.nullable(),
});

export type AccountView = z.infer<typeof accountView>;

/** What one "delete everything" removed from each store. */
export const deleteEverythingResult = z.object({
  /** Mongo `users`: 1, or 0 if the user never stored a choice */
  users: count,
  /** Mongo `nights` */
  nights: count,
  /** Tiger `night_noise` */
  noiseRows: count,
  /** Tiger `vitals` */
  vitalRows: count,
  /** Tiger `sleep_stages` */
  stageRows: count,
});

export type DeleteEverythingResult = z.infer<typeof deleteEverythingResult>;
