import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './env';

loadRootEnv();

const url = process.env.DATABASE_URL ?? 'postgres://magnox:magnox@localhost:5432/magnox';
const client = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

await migrate(drizzle(client), { migrationsFolder });
console.log('✔ migrations applied');
await client.end();
