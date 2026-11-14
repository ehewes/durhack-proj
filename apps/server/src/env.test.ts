import { expect, test } from "bun:test";
import { parseEnv } from "./env";

test("blank values from .env.example count as unset in development", () => {
  const env = parseEnv({ GEMINI_API_KEY: "", SOLANA_RPC_URL: "", PORT: "4000" });
  expect(env.GEMINI_API_KEY).toBeUndefined();
  expect(env.PORT).toBe(4000);
});

test("boots with no variables at all", () => {
  expect(parseEnv({}).PORT).toBe(3000);
});

test("the example file parses", async () => {
  const text = await Bun.file(new URL("../../../.env.example", import.meta.url)).text();
  const pairs = text
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=", 2) as [string, string]);
  expect(() => parseEnv(Object.fromEntries(pairs))).not.toThrow();
});
