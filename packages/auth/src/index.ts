import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { captcha } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { username } from 'better-auth/plugins/username';
import { eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { env, platformAdminEmails } from '@magnox/core/env';
import { logger } from '@magnox/core/logger';
import { renderEmail, sendMail } from '@magnox/core/mail';
import { cacheRedis } from '@magnox/core/redis';
import { DEFAULT_PREFS } from '@magnox/shared';

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

/** Auth endpoints that need a Turnstile token (when Turnstile is configured). */
export const TURNSTILE_ENDPOINTS = [
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/username',
  '/request-password-reset',
];

function socialProviders() {
  const e = env();
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET) {
    providers.discord = { clientId: e.DISCORD_CLIENT_ID, clientSecret: e.DISCORD_CLIENT_SECRET };
  }
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET };
  }
  if (e.TWITCH_CLIENT_ID && e.TWITCH_CLIENT_SECRET) {
    providers.twitch = { clientId: e.TWITCH_CLIENT_ID, clientSecret: e.TWITCH_CLIENT_SECRET };
  }
  return providers;
}

export function enabledSocialProviders(): string[] {
  return Object.keys(socialProviders());
}

function createAuth<P extends BetterAuthPlugin[]>(extraPlugins: P) {
  const e = env();
  const redis = cacheRedis();
  return betterAuth({
    appName: 'Magnox',
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
    secondaryStorage: {
      get: (key) => redis.get(`ba:${key}`),
      set: async (key, value, ttl) => {
        if (ttl) await redis.set(`ba:${key}`, value, 'EX', ttl);
        else await redis.set(`ba:${key}`, value);
      },
      getAndDelete: (key) => redis.getdel(`ba:${key}`),
      increment: async (key, ttl) => {
        // SET NX establishes the TTL only on creation, then INCR is atomic.
        const k = `ba:${key}`;
        const [, [, value]] = (await redis.multi().set(k, 0, 'EX', ttl, 'NX').incr(k).exec()) as [
          [null, unknown],
          [null, number],
        ];
        return value;
      },
      delete: async (key) => {
        await redis.del(`ba:${key}`);
      },
    },
    session: {
      storeSessionInDatabase: true,
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: {
      enabled: e.NODE_ENV !== 'test' && !e.DISABLE_RATE_LIMITS,
      storage: 'secondary-storage',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-in/username': { window: 60, max: 10 },
        '/sign-up/email': { window: 3600, max: 10 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 10 },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 256,
      requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { text, html } = renderEmail({
          heading: 'Reset your password',
          body: `Hi ${user.name}, someone asked to reset the password for your Magnox account. If this wasn't you, you can ignore this email.`,
          action: { label: 'Choose a new password', url },
        });
        await sendMail({ to: user.email, subject: 'Reset your Magnox password', text, html });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const { text, html } = renderEmail({
          heading: 'Confirm your email',
          body: `Welcome to Magnox, ${user.name}! Confirm your email address to finish setting up your account.`,
          action: { label: 'Confirm email', url },
        });
        await sendMail({ to: user.email, subject: 'Confirm your Magnox email', text, html });
      },
    },
    socialProviders: socialProviders(),
    account: {
      accountLinking: { enabled: true, trustedProviders: ['discord', 'google', 'twitch'] },
    },
    user: {
      deleteUser: { enabled: false },
      changeEmail: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db.insert(schema.userProfiles).values({ userId: user.id }).onConflictDoNothing();
            await db
              .insert(schema.userPreferences)
              .values({ userId: user.id, prefs: {} })
              .onConflictDoNothing();
            // Only with a confirmed email, or anyone could claim a listed address by signing up.
            if (user.emailVerified && platformAdminEmails().has(user.email.toLowerCase())) {
              await db
                .update(schema.users)
                .set({ role: 'admin' })
                .where(eq(schema.users.id, user.id));
              logger('auth').info({ userId: user.id }, 'granted platform admin');
            }
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'mx',
      useSecureCookies: e.APP_URL.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 24,
        usernameValidator: (name) => USERNAME_RE.test(name),
      }),
      twoFactor({ issuer: 'Magnox' }),
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
      // With Turnstile keys set, sign-up, sign-in and password resets need a solved challenge.
      ...(e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              provider: 'cloudflare-turnstile',
              secretKey: e.TURNSTILE_SECRET_KEY,
              endpoints: TURNSTILE_ENDPOINTS,
              siteVerifyURLOverride: e.TURNSTILE_VERIFY_URL,
            }),
          ]
        : []),
      ...extraPlugins,
    ],
  });
}

export { createAuth };
export type Auth = ReturnType<typeof createAuth<[]>>;
export type Session = Auth['$Infer']['Session'];

let shared: Auth | undefined;

/** Auth instance for non-Next processes (realtime, worker). */
export function auth(): Auth {
  shared ??= createAuth([]);
  return shared;
}

export { DEFAULT_PREFS };
