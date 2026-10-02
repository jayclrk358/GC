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
  /** The host communities point their own domains at (CNAME). Default: APP_URL's host. */
  CUSTOM_DOMAIN_TARGET: z.string().default(''),
  /** DNS resolvers for checking custom domains, comma-separated (default: the system's). */
  DNS_SERVERS: z.string().default(''),
  /** Error reporting (Sentry). Empty: off. */
  SENTRY_DSN: z.string().default(''),
  SENTRY_ENVIRONMENT: z.string().default(''),
  /** Share of requests traced for Sentry performance monitoring (0 to 1). */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  /** Traces to an OpenTelemetry collector (OTLP over HTTP). Empty: off. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''),
  OTEL_SERVICE_NAME: z.string().default(''),
  /** Share of traces kept (0 to 1). */
  OTEL_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
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
  /** Stripe: payments for community plans. Leave blank to turn the store off. */
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  /** Stripe Price ids (price_...) for each plan and billing interval. */
  STRIPE_PRICE_PLUS_MONTHLY: z.string().default(''),
  STRIPE_PRICE_PLUS_YEARLY: z.string().default(''),
  STRIPE_PRICE_PRO_MONTHLY: z.string().default(''),
  STRIPE_PRICE_PRO_YEARLY: z.string().default(''),
  /** Only for tests: a stand-in for Stripe's API (the worker's fixture server). */
  STRIPE_API_URL: z.string().default(''),
  /**
   * Voice channels (LiveKit). The address browsers connect to (wss://…; blank: this site, whose
   * /rtc path Caddy passes to LiveKit), the address this app uses for LiveKit's API, and the
   * API key and secret from LiveKit's config. Leave the key blank to turn voice off.
   */
  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_URL: z.string().default('http://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  PLATFORM_ADMIN_EMAILS: z.string().default(''),
  /** Web Push (notifications on devices). Make a pair with `npx web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Who push services can contact about this site: a mailto: or https: address. */
  VAPID_SUBJECT: z.string().optional(),
  /** Shown on the terms and privacy pages for questions and requests. */
  CONTACT_EMAIL: z
    .string()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
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

/** Where people can write to the site's operators, if set. */
export function contactEmail(): string | null {
  return env().CONTACT_EMAIL ?? null;
}
