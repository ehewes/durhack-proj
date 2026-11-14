import { z } from "zod";

// Every variable from docs/ARCHITECTURE.md ("Env vars"), one line each, grouped by feature.
// All optional, so the API boots anywhere (it skips a database whose URI is missing, with a
// warning). Features check their own keys when they first use them, with a clear error.
const schema = z.object({
  // platform
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().min(1).optional(),
  TIGER_URI: z.string().min(1).optional(),
  /** Directory of the Expo web export the API serves; unset in development */
  WEB_DIST: z.string().optional(),

  // labels, briefing (Gemini, paid tier)
  GEMINI_API_KEY: z.string().min(1).optional(),
  // labels, briefing (ElevenLabs)
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  // evidence (Solana mainnet, Memo program)
  SOLANA_RPC_URL: z.url().optional(),
  SOLANA_KEYPAIR: z.string().min(1).optional(),
  // works (Street Manager over SNS)
  STREET_MANAGER_TOPIC_ARN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parses an environment, treating blank values (`KEY=` in .env) as unset. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
}

/** Parsed on first use, so tests and type-only imports never need a full environment. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** A variable a feature can't run without. Throws a message that names it, never its value. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === "")
    throw new Error(`${String(key)} is not set (see .env.example)`);
  return value as NonNullable<Env[K]>;
}
