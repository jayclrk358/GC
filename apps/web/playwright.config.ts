import { defineConfig, devices } from '@playwright/test';

const prod = Boolean(process.env.E2E_PROD);
const env = {
  DISABLE_RATE_LIMITS: 'true',
  SERVER_QUERY_ALLOW_PRIVATE: 'true',
  // The fixture server stands in for Roblox's public APIs.
  ROBLOX_API_URL: 'http://127.0.0.1:25591/roblox',
  // ...and for Stripe (see apps/worker/src/fixtures/fake-stripe.ts).
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_month',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_year',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_month',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_year',
  STRIPE_API_URL: 'http://127.0.0.1:25591',
  // A throwaway Web Push key pair for tests only (pushes go to the fixture server).
  VAPID_PUBLIC_KEY:
    'BNDNhJBOgSwXMSgnTMLiLkh5rNSgWddiDuCpl2jVCelYpD2oNAIq3eSZAs_IWU8ZE_RDH3o7FLU25N1Nt5P_6KU',
  VAPID_PRIVATE_KEY: '2jwxRUay8xvRuWsi09LeXcBXoeb5hgH2ZkZGhPoT3v0',
  VAPID_SUBJECT: 'mailto:e2e@example.test',
};
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
    launchOptions: {
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
      // A pretend microphone (a beep) that's allowed without asking, for the voice tests.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
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
