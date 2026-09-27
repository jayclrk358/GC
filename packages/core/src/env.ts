import { z } from 'zod';
import { loadRootEnv } from '@magnox/db';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-secret-change-me-please-0123456789'),
  REDIS_QUEUE_URL: z.string().default('redis://localhost:6379/0'),
  REDIS_CACHE_URL: z.string().default('redis://localhost:6379/1'),
  REALTIME_PORT: z.coerce.number().int().default(3001),
  NEXT_PUBLIC_REALTIME_URL: z.string().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default(''),
  MEDIA_BASE_URL: z.string().default('http://localhost:3000/media'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('magnox'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  SMTP_URL: z.string().default(''),
  EMAIL_FROM: z.string().default('Magnox <no-reply@magnox.local>'),
  REQUIRE_EMAIL_VERIFICATION: bool,
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  SERVER_QUERY_ALLOW_PRIVATE: bool,
  TURNSTILE_SITE_KEY: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  /** Only for tests: where Turnstile tokens are checked. */
  TURNSTILE_VERIFY_URL: z
    .string()
    .url()
    .default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),
  /** Only for tests: a stand-in for Roblox's public APIs (apis. and games.roblox.com). */
  ROBLOX_API_URL: z.string().default(''),
  PLATFORM_ADMIN_EMAILS: z.string().default(''),
  DISABLE_RATE_LIMITS: bool,
  WORKER_HEALTH_PORT: z.coerce.number().int().default(3002),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  loadRootEnv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  // `next build` loads route modules to collect page data, but secrets are only provided when
  // the server runs (e.g. in Docker), so the production checks wait until then.
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  if (parsed.data.NODE_ENV === 'production' && !building) {
    if (parsed.data.BETTER_AUTH_SECRET.startsWith('dev-secret')) {
      throw new Error('BETTER_AUTH_SECRET must be set in production');
    }
    if (parsed.data.DISABLE_RATE_LIMITS) {
      throw new Error('DISABLE_RATE_LIMITS must never be enabled in production');
    }
    if (parsed.data.SERVER_QUERY_ALLOW_PRIVATE) {
      throw new Error('SERVER_QUERY_ALLOW_PRIVATE must never be enabled in production');
    }
  }
  cached = parsed.data;
  return cached;
}

export function platformAdminEmails(): Set<string> {
  return new Set(
    env()
      .PLATFORM_ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
