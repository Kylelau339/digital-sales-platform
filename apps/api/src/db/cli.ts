import type { Kysely } from 'kysely';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import migrations from './migrations/index.js';
import type { Database } from './types.js';
import { createDb, closeDb } from './client.js';

export async function migrate(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('schema_migrations').ifNotExists()
    .addColumn('name', 'text', col => col.primaryKey())
    .addColumn('applied_at', 'text', col => col.notNull()).execute();
  for (const migration of migrations) {
    await db.transaction().execute(async trx => {
      // Obtain the SQLite write reservation before checking the journal, including across processes.
      await trx.updateTable('schema_migrations').set({ applied_at: new Date().toISOString() }).where('name', '=', '__migration_lock__').execute();
      if (await trx.selectFrom('schema_migrations').select('name').where('name', '=', migration.name).executeTakeFirst()) return;
      await migration.up(trx);
      await trx.insertInto('schema_migrations').values({ name: migration.name, applied_at: new Date().toISOString() }).execute();
    });
  }
}

export function isMainModule(url: string, entry: string | undefined = process.argv[1]): boolean {
  return entry !== undefined && url === pathToFileURL(resolve(entry)).href;
}

async function main(): Promise<void> {
  let db: Kysely<Database> | undefined;
  try { db = createDb(); await migrate(db); }
  catch (error) { console.error(error); process.exitCode = 1; }
  finally { if (db) await closeDb(db); }
}
if (isMainModule(import.meta.url)) void main();
