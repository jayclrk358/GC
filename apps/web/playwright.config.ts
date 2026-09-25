import { defineConfig, devices } from '@playwright/test';

const prod = Boolean(process.env.E2E_PROD);
const env = { DISABLE_RATE_LIMITS: 'true', SERVER_QUERY_ALLOW_PRIVATE: 'true' };
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: prod ? 'pnpm --filter @magnox/web start' : 'pnpm --filter @magnox/web dev',
      url: 'http://localhost:3000/api/health',
      cwd: '../..',
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @magnox/realtime start',
      url: 'http://localhost:3001/health',
      cwd: '../..',
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
    {
      command: 'pnpm --filter @magnox/worker fixtures:servers',
      url: 'http://127.0.0.1:25591/health',
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @magnox/worker start',
      url: 'http://localhost:3002/health',
      cwd: '../..',
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
