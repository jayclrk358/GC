import postgres from 'postgres';
import { loadRootEnv } from './env';

loadRootEnv();

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset a production database.');
  process.exit(1);
}
const url =
  process.env.DATABASE_URL ?? 'postgres://gamecentral:gamecentral@localhost:5432/gamecentral';
const client = postgres(url, { max: 1, onnotice: () => {} });
await client.unsafe(
  'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
);
console.log('✔ database reset');
await client.end();
