import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sensitiveSessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';

// Signing in to the Windows app through the computer's own browser, where people are usually
// already signed in to Discord or Google (and Google allows its sign-in, which it doesn't inside
// apps). Same idea as signing in to a TV or a game launcher:
//
// 1. The app makes a random secret (the verifier) and opens the browser at
//    /desktop/sign-in?challenge=<SHA-256 of the verifier>.
// 2. Once signed in there, the browser asks for a one-time code bound to that challenge
//    (/desktop/handoff) and hands it to the app through a gamecentral:// link.
// 3. The app trades the code and its verifier for a session of its own (/desktop/redeem).
//
// Only the app that started step 1 knows the verifier, so a code is no use to anyone who sees it
// (in the browser's history, or by registering for gamecentral:// links themselves).

/** A SHA-256 hash or a 32-byte secret, base64url-encoded. */
const KEY = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const CODE_TTL_MS = 2 * 60 * 1000;
const identifier = (code: string) => `desktop-handoff:${code}`;

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Where a request came from, as the browser says (it can't be set by a web page). */
function sentFrom(ctx: { request?: Request; context: { baseURL: string } }) {
  const headers = ctx.request?.headers;
  return {
    own: new URL(ctx.context.baseURL).origin,
    origin: headers?.get('origin') ?? null,
    site: headers?.get('sec-fetch-site') ?? null,
  };
}

const forbidden = () => new APIError('FORBIDDEN', { message: 'Not allowed.' });

const refuse = () =>
  new APIError('BAD_REQUEST', {
    message: 'That sign-in link has expired or was already used. Please try again.',
  });

export const desktopHandoff = () =>
  ({
    id: 'desktop-handoff',
    endpoints: {
      /** Someone signed in, in their browser: a one-time code for the app. */
      desktopHandoff: createAuthEndpoint(
        '/desktop/handoff',
        {
          method: 'POST',
          // Checked against the stored session, not the cookie's copy: one signed out moments
          // ago (a password reset, say) can't be turned into a new session for the app.
          use: [sensitiveSessionMiddleware],
          body: z.object({ challenge: KEY }),
        },
        async (ctx) => {
          // Only from Game Central's own page: browsers always say where a POST comes from, so
          // another website can't get a code for whoever is signed in (whatever Better Auth's own
          // origin check is set to).
          const from = sentFrom(ctx);
          if (from.origin !== from.own || (from.site && from.site !== 'same-origin')) {
            throw forbidden();
          }
          const { session, user } = ctx.context.session;
          // Staff looking at someone's account as them can't hand that on as a session of its own.
          if ((session as { impersonatedBy?: string | null }).impersonatedBy) throw forbidden();
          const code = randomBytes(32).toString('base64url');
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifier(code),
            value: JSON.stringify({
              userId: user.id,
              sessionId: session.id,
              challenge: ctx.body.challenge,
            }),
            expiresAt: new Date(Date.now() + CODE_TTL_MS),
          });
          return ctx.json({ code });
        },
      ),
      /** The app: a session of its own for the code, if it knows the matching verifier. */
      desktopRedeem: createAuthEndpoint(
        '/desktop/redeem',
        { method: 'POST', body: z.object({ code: KEY, verifier: KEY }) },
        async (ctx) => {
          // Only the app calls this, saying it comes from the site itself (Better Auth's own check
          // wants that whenever there are cookies). From another site, it could only be an attempt
          // to sign this browser in to the wrong account.
          const from = sentFrom(ctx);
          if ((from.origin && from.origin !== from.own) || from.site === 'cross-site') {
            throw forbidden();
          }
          // Used up whatever happens next: each code gets one try.
          const stored = await ctx.context.internalAdapter.consumeVerificationValue(
            identifier(ctx.body.code),
          );
          if (!stored || stored.expiresAt.getTime() < Date.now()) throw refuse();
          const { userId, sessionId, challenge } = JSON.parse(stored.value) as {
            userId: string;
            sessionId: string;
            challenge: string;
          };
          if (!sameKey(challengeFor(ctx.body.verifier), challenge)) throw refuse();
          // Signed out in the browser since (or signed out everywhere): no session for the app.
          const sessions = await ctx.context.internalAdapter.listSessions(userId);
          if (!sessions.some((s) => s.id === sessionId)) throw refuse();
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) throw refuse();
          const banned = user as { banned?: boolean | null; banExpires?: Date | null };
          if (banned.banned && (!banned.banExpires || banned.banExpires.getTime() > Date.now())) {
            throw new APIError('FORBIDDEN', { message: 'This account has been suspended.' });
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
    rateLimit: [
      { pathMatcher: (path: string) => path.startsWith('/desktop/'), window: 60, max: 10 },
    ],
  }) satisfies BetterAuthPlugin;
