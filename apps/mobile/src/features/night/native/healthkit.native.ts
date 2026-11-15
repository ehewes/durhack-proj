import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  requestAuthorization,
} from "@kingstinct/react-native-healthkit";
import {
  createWatchSleepReader,
  type HealthPort,
  type HealthSample,
  type SleepWindow,
  type WatchSleepReader,
} from "./watch-sleep";

// iOS. Metro picks this file on the phone and `healthkit.web.ts` on the web; TypeScript resolves
// this one through `moduleSuffixes`, so both files export the same `watchSleep`.

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const HEART_RATE = "HKQuantityTypeIdentifierHeartRate";
const HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const BREATHING = "HKQuantityTypeIdentifierRespiratoryRate";

type Sample = {
  startDate: Date;
  endDate: Date;
  sourceRevision: { source: { bundleIdentifier: string }; productType?: string };
  device?: { model?: string };
};

/** Watch samples carry a "Watch7,1"-style product type, or a device whose model is "Watch". */
function fromWatch(sample: Sample): boolean {
  return (
    sample.sourceRevision.productType?.startsWith("Watch") === true ||
    sample.device?.model === "Watch"
  );
}

function toSample(sample: Sample, value: number): HealthSample {
  return {
    start: sample.startDate,
    end: sample.endDate,
    value,
    sourceId: sample.sourceRevision.source.bundleIdentifier,
    fromWatch: fromWatch(sample),
  };
}

/** Samples that overlap the window. `limit: 0` reads all of them. */
const during = (window: SleepWindow) => ({
  limit: 0,
  ascending: true,
  filter: { date: { startDate: window.start, endDate: window.end } },
});

const healthKit: HealthPort = {
  isAvailable: () => isHealthDataAvailable(),
  requestRead: () => requestAuthorization({ toRead: [SLEEP, HEART_RATE, HRV, BREATHING] }),
  async read(window) {
    const [stages, heartRate, hrv, breathing] = await Promise.all([
      queryCategorySamples(SLEEP, during(window)),
      queryQuantitySamples(HEART_RATE, { ...during(window), unit: "count/min" }),
      queryQuantitySamples(HRV, { ...during(window), unit: "ms" }),
      queryQuantitySamples(BREATHING, { ...during(window), unit: "count/min" }),
    ]);
    return {
      stages: stages.map((sample) => toSample(sample, sample.value)),
      heartRate: heartRate.map((sample) => toSample(sample, sample.quantity)),
      hrv: hrv.map((sample) => toSample(sample, sample.quantity)),
      respiratoryRate: breathing.map((sample) => toSample(sample, sample.quantity)),
    };
  },
};

/** The Watch's sleep stages, heart rate, HRV and breathing rate, read from HealthKit. */
export const watchSleep: WatchSleepReader = createWatchSleepReader(healthKit);
