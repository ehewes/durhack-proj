import { expect, test } from "bun:test";
import { env, parseEnv } from "./env";

test("blank values from .env.example count as unset in development", () => {
  const env = parseEnv({ GEMINI_API_KEY: "", SOLANA_RPC_URL: "", PORT: "4000" });
  expect(env.GEMINI_API_KEY).toBeUndefined();
  expect(env.PORT).toBe(4000);
});

test("boots with no variables at all", () => {
  expect(parseEnv({}).PORT).toBe(3000);
});

test("a key set after the first read is visible", () => {
  delete process.env.ELEVENLABS_API_KEY;
  expect(env().ELEVENLABS_API_KEY).toBeUndefined();
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    expect(env().ELEVENLABS_API_KEY).toBe("test-key");
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
  }
});

test("the example file parses", async () => {
  const text = await Bun.file(new URL("../../../.env.example", import.meta.url)).text();
  const pairs = text
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]);
  expect(() => parseEnv(Object.fromEntries(pairs))).not.toThrow();
});
