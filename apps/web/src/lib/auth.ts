import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { nextCookies } from 'better-auth/next-js';
import { createAuth } from '@magnox/auth';
import { markSessionsStale, sessionsRevoked } from '@magnox/core';

const g = globalThis as unknown as { __mxAuth?: ReturnType<typeof make> };
const make = () => createAuth([nextCookies()]);

/** Better Auth instance for the Next.js app (sets cookies from server actions). */
export const auth = g.__mxAuth ?? make();
if (process.env.NODE_ENV !== 'production') g.__mxAuth = auth;

export type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionUser = SessionData['user'];

/** Current session for this request (deduplicated per render). */
export const getSession = cache(async (): Promise<SessionData | null> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  // Signed out by an admin (e.g. banned): don't trust the cookie's cached copy of the session.
  if (session && (await sessionsRevoked(session.user.id))) {
    return auth.api.getSession({ headers: h, query: { disableCookieCache: true } });
  }
  return session;
});

/** End all of someone's sessions, wherever Better Auth keeps them (database and Redis). */
export async function endSessions(userId: string): Promise<void> {
  await (await auth.$context).internalAdapter.deleteUserSessions(userId);
}

export async function getUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/** For pages: redirect to sign-in if there is no session. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) {
    const next = returnTo ?? (await headers()).get('x-pathname') ?? '/';
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  return user;
}

/**
 * Someone's account was changed for them (staff renamed them, say): update the copy of it their
 * sessions carry, so they see the change without signing in again.
 */
export async function refreshSessions(userId: string): Promise<void> {
  const { internalAdapter } = await auth.$context;
  const user = await internalAdapter.findUserById(userId);
  if (user) await internalAdapter.refreshUserSessions(user);
  await markSessionsStale(userId);
}
