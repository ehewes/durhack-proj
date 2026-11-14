import { createApp } from "./app";
import { ensureIndexes } from "./db/indexes";
import { migrate } from "./db/migrate";
import { connectMongo } from "./db/mongo";
import { connectTiger } from "./db/tiger";
import { env } from "./env";

await Promise.all([connectMongo(), connectTiger()]);
await Promise.all([migrate(), ensureIndexes()]);

const { PORT, WEB_DIST } = env();
const server = Bun.serve({ port: PORT, fetch: createApp({ webDist: WEB_DIST }).fetch });
console.log(`api listening on ${server.url}`);
