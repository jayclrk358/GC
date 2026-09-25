import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/web/e2e/**'],
    environment: 'node',
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
