'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  encodePrefsCookie,
  parsePrefs,
  prefsSchema,
  PREFS_COOKIE,
  type Prefs,
} from '@magnox/shared';
import { getUser } from '@/lib/auth';
import { runAction } from '@/lib/action';

// Not httpOnly: the browser also writes this cookie so changes apply before the action returns.
const COOKIE_OPTS = {
  httpOnly: false,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.APP_URL?.startsWith('https://') ?? false,
};

async function writeCookie(prefs: Prefs) {
  (await cookies()).set(PREFS_COOKIE, encodePrefsCookie(prefs), COOKIE_OPTS);
}

/** Save display preferences to this browser and, when signed in, to the account. */
export async function savePrefs(input: unknown) {
  return runAction(async () => {
    const prefs = prefsSchema.parse(input);
    await writeCookie(prefs);
    const user = await getUser();
    if (user) {
      await db
        .insert(schema.userPreferences)
        .values({ userId: user.id, prefs })
        .onConflictDoUpdate({ target: schema.userPreferences.userId, set: { prefs } });
    }
    return prefs;
  });
}

/** After signing in, adopt the preferences stored on the account. */
export async function syncPrefsFromAccount() {
  return runAction(async () => {
    const user = await getUser();
    if (!user) return null;
    const row = await db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, user.id),
    });
    if (!row || Object.keys(row.prefs).length === 0) return null;
    const prefs = parsePrefs(row.prefs);
    await writeCookie(prefs);
    return prefs;
  });
}
