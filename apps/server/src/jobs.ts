export interface Job {
  name: string;
  /** node-cron expression, e.g. every 5 minutes: "*\/5 * * * *" */
  schedule: string;
  run: () => Promise<void>;
}
