import type { Job } from "../../jobs";

export { accountRouter } from "./router";
export const accountJobs: Job[] = [];

export type { AccountView, ConsentChoices, DeleteEverythingResult } from "@kip/shared/account";
export { AccountStorageError } from "./errors";
export type { AccountService } from "./service";
