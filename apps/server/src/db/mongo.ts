import { type Db, MongoClient } from "mongodb";
import { requireEnv } from "../env";
import { retry } from "../retry";

/** Atlas connection strings usually name no database, which would mean `test`. */
export const DB_NAME = "kip";

let client: MongoClient | undefined;

export function mongo(): Db {
  client ??= new MongoClient(requireEnv("MONGO_URI"));
  return client.db(DB_NAME);
}

export async function connectMongo(): Promise<void> {
  await retry("mongo", async () => {
    await mongo().command({ ping: 1 });
  });
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
}
