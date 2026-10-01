'use server';

import { headers } from 'next/headers';
import { acceptTerms, confirmAdult, deleteAccount, markSessionsRevoked } from '@magnox/core';
import { auth, endSessions, getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

export async function acceptTermsAction() {
  return runAction(async () => {
    await acceptTerms((await getUser())?.id ?? null);
  });
}

export async function confirmAdultAction() {
  return runAction(async () => {
    await confirmAdult((await getUser())?.id ?? null);
  });
}

export async function deleteAccountAction(input: unknown) {
  return runAction(async () => {
    const user = await getUser();
    await deleteAccount(user?.id ?? null, input);
    if (!user) return;
    // Signed out everywhere, this browser included.
    await endSessions(user.id);
    await markSessionsRevoked(user.id);
    await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  });
}
