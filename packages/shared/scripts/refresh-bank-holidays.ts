// Refreshes src/domain/bank-holidays.json from GOV.UK. Run: bun run refresh:bank-holidays
import { join } from "node:path";
import { BANK_HOLIDAYS_URL } from "../src/domain/construction-hours";

type GovUk = Record<string, { events: { date: string }[] }>;

const res = await fetch(BANK_HOLIDAYS_URL);
if (!res.ok) throw new Error(`GOV.UK answered ${res.status}`);
const data = (await res.json()) as GovUk;
const dates = (data["england-and-wales"]?.events ?? []).map((e) => e.date).sort();
if (dates.length === 0) throw new Error("no england-and-wales dates in the response");

const out = join(import.meta.dir, "../src/domain/bank-holidays.json");
await Bun.write(
  out,
  `${JSON.stringify({ source: BANK_HOLIDAYS_URL, fetchedAt: new Date().toISOString().slice(0, 10), englandAndWales: dates }, null, 2)}\n`,
);
console.log(`wrote ${dates.length} dates, ${dates[0]} to ${dates.at(-1)}`);
