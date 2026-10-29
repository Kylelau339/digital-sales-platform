import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DatabaseSchema } from './types.js';

export function createDb(filename = process.env.DATABASE_PATH ?? './var/motion-market.db'): Kysely<DatabaseSchema> {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  return new Kysely<DatabaseSchema>({ dialect: new SqliteDialect({ database: sqlite }) });
}

export async function closeDb(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.destroy();
}
