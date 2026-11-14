import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** The slice of a postgres.js client the runner needs, so tests can pass a fake. */
export type SqlClient = {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  unsafe(query: string): Promise<unknown>;
  begin<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
};

export type MigrationFile = { name: string; sql: string };

export const NO_TRANSACTION = "-- kip:no-transaction";

export const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export async function readMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    names.map(async (name) => ({ name, sql: await Bun.file(join(dir, name)).text() })),
  );
}

/**
 * Applies migrations in filename order, once each, recording them in `_migrations`.
 * Name new files YYYYMMDDHHMM_<feature>_<what>.sql so parallel branches never collide.
 * Fails if TimescaleDB isn't installed afterwards: every hypertable depends on it.
 *
 * Each file runs in a transaction, except files whose first line is `-- kip:no-transaction`.
 * Use that for statements TimescaleDB refuses inside one, such as creating a continuous
 * aggregate WITH DATA; keep such files to a single idempotent statement.
 */
export async function migrate(sql: SqlClient, files: MigrationFile[]): Promise<string[]> {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  const rows = await sql<{ name: string }[]>`select name from _migrations`;
  const done = new Set(rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(file.name)) continue;
    if (file.sql.trimStart().startsWith(NO_TRANSACTION)) {
      await sql.unsafe(file.sql);
      await sql`insert into _migrations (name) values (${file.name})`;
    } else {
      await sql.begin(async (tx) => {
        await tx.unsafe(file.sql);
        await tx`insert into _migrations (name) values (${file.name})`;
      });
    }
    applied.push(file.name);
  }
  const ext = await sql<
    { extname: string }[]
  >`select extname from pg_extension where extname = 'timescaledb'`;
  if (ext.length === 0)
    throw new Error("TimescaleDB extension is missing: is TIGER_URI a Tiger/Timescale database?");
  return applied;
}

if (import.meta.main) {
  const { closeTiger, connectTiger, tiger } = await import("./tiger");
  await connectTiger();
  const applied = await migrate(tiger() as unknown as SqlClient, await readMigrations());
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
  await closeTiger();
}
