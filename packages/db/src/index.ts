import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { loadRootEnv } from './env';

loadRootEnv();

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://gamecentral:gamecentral@localhost:5432/gamecentral';

const globalForDb = globalThis as unknown as { __mxSql?: postgres.Sql };

export const sql =
  globalForDb.__mxSql ??
  postgres(DATABASE_URL, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    // Close connections left idle for a minute, so quiet processes don't hold server memory.
    idle_timeout: 60,
    // Hosted poolers in transaction mode (Neon's "-pooler" address, Supabase on port 6543)
    // can't keep prepared statements between queries: set DATABASE_PREPARE=false for those.
    prepare: process.env.DATABASE_PREPARE !== 'false',
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__mxSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export { schema, loadRootEnv };
export * from './schema';
