/**
 * Fallback when HealthKit access slips: upload one night from the Health app's export.
 *
 *   bun src/features/night/import-health-export.ts <export.xml> --night 2026-11-13 \
 *     --user <uuid> [--api http://localhost:3000] [--dry-run]
 *
 * Prints counts only, never health values.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { buildUpload, collectNight } from "./health-export";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    night: { type: "string" },
    user: { type: "string" },
    api: { type: "string", default: "http://localhost:3000" },
    "dry-run": { type: "boolean", default: false },
  },
});

const file = positionals[0];
if (!file || !values.night || !values.user) {
  console.error("usage: import-health-export.ts <export.xml> --night YYYY-MM-DD --user <uuid>");
  process.exit(2);
}

const collector = collectNight(values.night);
for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
  collector.add(line);
}
const parsed = collector.finish();
const upload = buildUpload(values.user, values.night, parsed);
console.log(
  `night ${values.night}: ${parsed.stages.length} stages, ${parsed.heartRate.length} heart rate, ` +
    `${parsed.hrv.length} HRV, ${parsed.respiratoryRate.length} respiratory samples`,
);
if (values["dry-run"]) process.exit(0);

// The API speaks superjson: the plain input goes under `json`.
const res = await fetch(`${values.api}/trpc/night.upload`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-kip-user": values.user },
  body: JSON.stringify({ json: upload }),
});
if (!res.ok) {
  console.error(`upload failed: HTTP ${res.status}`);
  process.exit(1);
}
console.log(`uploaded night ${upload.nightId}`);
