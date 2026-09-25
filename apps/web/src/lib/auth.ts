import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { nextCookies } from 'better-auth/next-js';
import { createAuth } from '@magnox/auth';

const g = globalThis as unknown as { __mxAuth?: ReturnType<typeof make> };
const make = () => createAuth([nextCookies()]);

/** Better Auth instance for the Next.js app (sets cookies from server actions). */
export const auth = g.__mxAuth ?? make();
if (process.env.NODE_ENV !== 'production') g.__mxAuth = auth;

export type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionUser = SessionData['user'];

/** Current session for this request (deduplicated per render). */
export const getSession = cache(async (): Promise<SessionData | null> => {
  return auth.api.getSession({ headers: await headers() });
});

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
