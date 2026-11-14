import type { Job } from "../../jobs";

export { accountRouter } from "./router";
export const accountJobs: Job[] = [];

export type { AccountView, ConsentChoices, DeleteEverythingResult } from "@kip/shared/account";
export { AccountDeletingError, AccountStorageError } from "./errors";
export type { AccountService } from "./service";
/** `getAccount(userId)`: consent and profile. `allowedConsent(userId, requested)`: see service.ts */
export { allowedConsent, getAccount } from "./service";
