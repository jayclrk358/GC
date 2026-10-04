import { createHMAC } from '@better-auth/utils/hmac';
import { createOTP } from '@better-auth/utils/otp';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie, expireCookie } from 'better-auth/cookies';
import { generateRandomString, symmetricDecrypt } from 'better-auth/crypto';

// Two-factor sign-in, whichever way someone signs in. Better Auth's own plugin asks for the code
// after a password only: signing in with Discord, Google or Twitch, or by following an email
// confirmation link, would skip it. Here those ask too, the same way: the new session is dropped,
// and the browser goes to the code page, which finishes signing in once the code checks out.
//
// It also lets accounts without a password (made with Discord, Google or Twitch) use two-factor.
// Where a password would be asked for, they prove it's them another way: turning it on needs a
// recent sign-in, and turning it off or making new backup codes needs a code from the
// authenticator app (or a backup code).

// Better Auth's two-factor plugin's own names and timings, so its code page finishes these too.
const TWO_FACTOR_COOKIE = 'two_factor';
const TRUST_DEVICE_COOKIE = 'trust_device';
const CHALLENGE_MAX_AGE = 10 * 60;
const TRUST_DEVICE_MAX_AGE = 30 * 24 * 60 * 60;

/** How recently someone without a password must have signed in to turn two-factor on. */
export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

/** Sign-ins that make a session without a password. */
const SIGN_IN_PATHS = new Set([
  '/callback/:id',
  '/oauth2/callback/:id',
  '/sign-in/social',
  '/verify-email',
]);

/** Where a password is asked for, and a code is asked for instead when there isn't one. */
const CODE_INSTEAD_OF_PASSWORD = new Set([
  '/two-factor/disable',
  '/two-factor/generate-backup-codes',
  '/two-factor/get-totp-uri',
]);

export type TwoFactorEvent = 'on' | 'off' | 'backup-code-used';

export interface TwoFactorEverywhereOptions {
  /** Told when two-factor is turned on or off, or a backup code is used to sign in. */
  notify?: (
    event: TwoFactorEvent,
    user: { id: string; name: string; email: string },
    detail: { backupCodesLeft?: number },
  ) => void | Promise<void>;
}

interface TwoFactorRow {
  id: string;
  secret: string;
  backupCodes: string;
  verified?: boolean | null;
}

// Better Auth's middleware context, as these hooks get it.
type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

function twoFactorRow(ctx: Ctx, userId: string) {
  return ctx.context.adapter.findOne<TwoFactorRow>({
    model: 'twoFactor',
    where: [{ field: 'userId', value: userId }],
  });
}

async function backupCodes(ctx: Ctx, row: TwoFactorRow): Promise<string[]> {
  try {
    const codes: unknown = JSON.parse(
      await symmetricDecrypt({ key: ctx.context.secretConfig, data: row.backupCodes }),
    );
    return Array.isArray(codes) ? codes.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether a code from someone's authenticator app, or one of their backup codes, is right. */
export async function codeIsRight(ctx: Ctx, userId: string, code: string): Promise<boolean> {
  const row = await twoFactorRow(ctx, userId);
  if (!row || row.verified === false) return false;
  const typed = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(typed)) {
    const secret = await symmetricDecrypt({ key: ctx.context.secretConfig, data: row.secret });
    return createOTP(secret, { digits: 6, period: 30 }).verify(typed);
  }
  return typed.length > 0 && (await backupCodes(ctx, row)).includes(typed);
}

async function hasPassword(ctx: Ctx, userId: string): Promise<boolean> {
  const account = await ctx.context.internalAdapter.findCredentialAccount(userId);
  return Boolean(account?.password);
}

/**
 * Whether this browser was trusted at an earlier sign-in ("don't ask again on this device"). As in
 * Better Auth's plugin, each use swaps the trust for a fresh one, so a copied cookie works once.
 */
async function trustedDevice(ctx: Ctx, userId: string): Promise<boolean> {
  const cookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, {
    maxAge: TRUST_DEVICE_MAX_AGE,
  });
  const value = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!value) return false;
  const [token, trustId] = value.split('!');
  const sign = (id: string) =>
    createHMAC('SHA-256', 'base64urlnopad').sign(ctx.context.secret, `${userId}!${id}`);
  if (token && trustId && token === (await sign(trustId))) {
    const record = await ctx.context.internalAdapter.findVerificationValue(trustId);
    if (record && record.value === userId && record.expiresAt > new Date()) {
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(trustId);
      const nextId = `trust-device-${generateRandomString(32)}`;
      await ctx.context.internalAdapter.createVerificationValue({
        value: userId,
        identifier: nextId,
        expiresAt: new Date(Date.now() + TRUST_DEVICE_MAX_AGE * 1000),
      });
      await ctx.setSignedCookie(
        cookie.name,
        `${await sign(nextId)}!${nextId}`,
        ctx.context.secret,
        cookie.attributes,
      );
      return true;
    }
  }
  expireCookie(ctx, cookie);
  return false;
}

/** The code page, coming back to wherever the sign-in was headed (on this site only). */
export function codePageFor(location: string, baseURL: string): string {
  const site = new URL(baseURL).origin;
  let next = '/';
  try {
    const to = new URL(location, site);
    if (to.origin === site) next = `${to.pathname}${to.search}${to.hash}`;
  } catch {
    // Not a URL: home.
  }
  return `${site}/sign-in/two-factor?next=${encodeURIComponent(next)}`;
}

export const twoFactorEverywhere = (options: TwoFactorEverywhereOptions = {}) => {
  // Not waited for, and a failure is let go: a missed email mustn't hold up or undo the change.
  const notify: NonNullable<TwoFactorEverywhereOptions['notify']> = (...args) => {
    try {
      Promise.resolve(options.notify?.(...args)).catch(() => {});
    } catch {
      // As above.
    }
  };

  return {
    id: 'two-factor-everywhere',
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path === '/two-factor/enable' || CODE_INSTEAD_OF_PASSWORD.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            // No session: the endpoint itself turns it away. A password: it asks for that.
            if (!session || (await hasPassword(ctx, session.user.id))) return;
            if (ctx.path === '/two-factor/enable') {
              const signedIn = new Date(session.session.createdAt).getTime();
              if (Date.now() - signedIn > RECENT_SIGN_IN_MS) {
                throw new APIError('FORBIDDEN', {
                  code: 'SIGN_IN_AGAIN',
                  message: 'For your security, sign in again, then turn on two-factor.',
                });
              }
              return;
            }
            const code = (ctx.body as { code?: unknown } | undefined)?.code;
            if (typeof code !== 'string' || !(await codeIsRight(ctx, session.user.id, code))) {
              throw new APIError('BAD_REQUEST', {
                code: 'INVALID_CODE',
                message: 'That code isn’t right. Try again.',
              });
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => SIGN_IN_PATHS.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession;
            if (!data?.user.twoFactorEnabled) return;
            // The session they came with, refreshed (confirming their email while signed in).
            if (ctx.context.session?.session.token === data.session.token) return;
            if (await trustedDevice(ctx, data.user.id)) return;

            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(data.session.token);
            ctx.context.setNewSession(null);

            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, {
              maxAge: CHALLENGE_MAX_AGE,
            });
            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(Date.now() + CHALLENGE_MAX_AGE * 1000);
            await ctx.context.internalAdapter.createVerificationValue({
              value: data.user.id,
              identifier,
              expiresAt,
            });
            await ctx.context.internalAdapter.createVerificationValue({
              value: '0',
              identifier: `2fa-attempts-${identifier}`,
              expiresAt,
            });
            await ctx.setSignedCookie(
              cookie.name,
              identifier,
              ctx.context.secret,
              cookie.attributes,
            );

            const location = ctx.context.responseHeaders?.get('location');
            if (location) {
              ctx.setHeader('location', codePageFor(location, ctx.context.baseURL));
              return;
            }
            return ctx.json({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
          }),
        },
        {
          matcher: (ctx) =>
            ctx.path === '/two-factor/verify-totp' ||
            ctx.path === '/two-factor/disable' ||
            ctx.path === '/two-factor/verify-backup-code',
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (!returned || returned instanceof Error || returned instanceof Response) return;
            const user = ctx.context.newSession?.user;
            if (!user) return;
            const challenge = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
            const signingIn = Boolean(
              await ctx.getSignedCookie(challenge.name, ctx.context.secret),
            );
            if (ctx.path === '/two-factor/disable') {
              notify('off', user, {});
            } else if (ctx.path === '/two-factor/verify-totp') {
              // Outside signing in, a new session here means setup just finished.
              if (!signingIn && user.twoFactorEnabled) notify('on', user, {});
            } else if (signingIn) {
              const row = await twoFactorRow(ctx, user.id);
              const left = row ? (await backupCodes(ctx, row)).length : 0;
              notify('backup-code-used', user, { backupCodesLeft: left });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
