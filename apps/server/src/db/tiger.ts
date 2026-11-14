import postgres from "postgres";
import { requireEnv } from "../env";
import { retry } from "../retry";

let client: postgres.Sql | undefined;

export function tiger(): postgres.Sql {
  client ??= postgres(requireEnv("TIGER_URI"), { onnotice: () => {} });
  return client;
}

export async function connectTiger(): Promise<void> {
  await retry("tiger", async () => {
    await tiger()`select 1`;
  });
}

export async function closeTiger(): Promise<void> {
  await client?.end();
  client = undefined;
}
