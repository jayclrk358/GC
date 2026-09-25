import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './src/env';

loadRootEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://magnox:magnox@localhost:5432/magnox',
  },
  strict: true,
  verbose: true,
});
