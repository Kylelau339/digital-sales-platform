import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnv } from './config/env.js';
import { createDb, closeDb } from './db/client.js';
import { migrate } from './db/cli.js';
import { createApp } from './app.js';

const config = loadEnv();
mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
const db = createDb(config.DATABASE_PATH);
await migrate(db);
const app = createApp(db, config);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); await closeDb(db); process.exit(0); });
}
await app.listen({ host: config.HOST, port: config.PORT });
