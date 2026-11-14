import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { closeTiger, connectTiger, tiger } from "./tiger";

/**
 * Applies SQL files in db/migrations in name order, once each.
 * Name new files YYYYMMDDHHMM_<feature>_<what>.sql so parallel branches never collide.
 */
export async function migrate(dir = join(import.meta.dir, "migrations")): Promise<string[]> {
  const sql = tiger();
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set(
    (await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await Bun.file(join(dir, file)).text();
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}

if (import.meta.main) {
  await connectTiger();
  const applied = await migrate();
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
  await closeTiger();
}
