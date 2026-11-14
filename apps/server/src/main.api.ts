import { createApp } from "./app";
import { ensureIndexes } from "./db/indexes";
import { migrate, readMigrations, type SqlClient } from "./db/migrate";
import { connectMongo, mongo } from "./db/mongo";
import { connectTiger, tiger } from "./db/tiger";
import { env } from "./env";

const { PORT, WEB_DIST, MONGO_URI, TIGER_URI } = env();

// Databases are optional: without them the API still serves /health, the web build and the stubs.
if (TIGER_URI) {
  await connectTiger();
  await migrate(tiger() as unknown as SqlClient, await readMigrations());
} else console.warn("TIGER_URI not set: skipping Tiger");
if (MONGO_URI) {
  await connectMongo();
  await ensureIndexes(mongo());
} else console.warn("MONGO_URI not set: skipping MongoDB");

const server = Bun.serve({ port: PORT, fetch: createApp({ webDist: WEB_DIST }).fetch });
console.log(`api listening on ${server.url}`);
