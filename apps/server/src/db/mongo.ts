import { type Db, MongoClient } from "mongodb";
import { requireEnv } from "../env";
import { retry } from "../retry";

let client: MongoClient | undefined;

export function mongo(): Db {
  client ??= new MongoClient(requireEnv("MONGO_URI"));
  return client.db();
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
