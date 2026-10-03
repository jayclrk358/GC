import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './env';

loadRootEnv();

const url =
  process.env.DATABASE_URL ?? 'postgres://gamecentral:gamecentral@localhost:5432/gamecentral';
const client = postgres(url, {
  max: 1,
  prepare: process.env.DATABASE_PREPARE !== 'false',
  onnotice: () => {},
});
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

await migrate(drizzle(client), { migrationsFolder });
console.log('✔ migrations applied');
await client.end();
