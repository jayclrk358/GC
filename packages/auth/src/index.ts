import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { captcha } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { username } from 'better-auth/plugins/username';
import { eq } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { env, platformAdminEmails } from '@gamecentral/core/env';
import { logger } from '@gamecentral/core/logger';
import { renderEmail, sendMail } from '@gamecentral/core/mail';
import { cacheRedis } from '@gamecentral/core/redis';
import { DEFAULT_PREFS } from '@gamecentral/shared';
import { desktopHandoff } from './desktop-handoff';
import { clampName, userInputProblem } from './user-input';

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

/** Auth endpoints that need a Turnstile token (when Turnstile is configured). */
export const TURNSTILE_ENDPOINTS = [
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/username',
  '/request-password-reset',
  // Both send email, to addresses nobody has confirmed yet.
  '/change-email',
  '/send-verification-email',
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
    appName: 'Game Central',
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
        '/change-email': { window: 3600, max: 5 },
        '/send-verification-email': { window: 3600, max: 5 },
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
          body: `Hi ${user.name}, someone asked to reset the password for your Game Central account. If this wasn't you, you can ignore this email.`,
          action: { label: 'Choose a new password', url },
        });
        await sendMail({ to: user.email, subject: 'Reset your Game Central password', text, html });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      // No name: this goes to an address nobody has confirmed yet, and the name is whatever the
      // account holder typed.
      sendVerificationEmail: async ({ user, url }) => {
        const { text, html } = renderEmail({
          heading: 'Confirm your email',
          body: 'Welcome to Game Central! Confirm your email address to finish setting up your account.',
          action: { label: 'Confirm email', url },
        });
        await sendMail({ to: user.email, subject: 'Confirm your Game Central email', text, html });
      },
    },
    socialProviders: socialProviders(),
    account: {
      // Signing in with a provider links to an existing account with the same email, so the
      // provider must vouch for the address. Discord and Twitch accounts can carry an address
      // their owner never confirmed (they say whether it's confirmed), so they link only when it
      // is: otherwise anyone could register there with someone else's address and sign in as
      // them, admins included. Google, which confirms the addresses its accounts use, is trusted
      // outright. The account being linked into must have confirmed its address too (Better
      // Auth's default, stated here so it stays on).
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
        requireLocalEmailVerified: true,
      },
    },
    user: {
      deleteUser: { enabled: false },
      changeEmail: {
        enabled: true,
        // A confirmed address approves the change first, so only its owner can have Game Central
        // email the new one (accounts without one still get a link at the new address).
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          const { text, html } = renderEmail({
            heading: 'Approve your new email address',
            body: `Someone asked to change the email address of your Game Central account to ${newEmail}. If that was you, approve the change and we'll send a link to the new address. If it wasn't, ignore this email and change your password.`,
            action: { label: 'Approve the change', url },
          });
          await sendMail({
            to: user.email,
            subject: 'Approve your Game Central email change',
            text,
            html,
          });
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const problem = userInputProblem(ctx.path, ctx.body);
        if (problem) throw new APIError('BAD_REQUEST', { message: problem });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Names from sign-in providers aren't checked like typed ones.
          before: async (user) => ({
            data: { ...user, name: typeof user.name === 'string' ? clampName(user.name) : '' },
          }),
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
      twoFactor({ issuer: 'Game Central' }),
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
      // Signing in to the Windows app through the browser (see desktop-handoff.ts).
      desktopHandoff(),
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
