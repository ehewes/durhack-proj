import { createWatchSleepReader, type WatchSleepReader } from "./watch-sleep";

// The web dashboard has no HealthKit: every read is "unavailable", and the HealthKit package
// never reaches the web bundle.

export const watchSleep: WatchSleepReader = createWatchSleepReader(null);
