import { z } from "zod";

// One line per variable, grouped by feature. Add yours with your feature's issue.
const schema = z.object({
  // platform
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().min(1),
  TIGER_URI: z.string().min(1),
  /** Directory of the Expo web export the API serves; unset in development */
  WEB_DIST: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed on first use, so tests and type-only imports never need a full environment. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
