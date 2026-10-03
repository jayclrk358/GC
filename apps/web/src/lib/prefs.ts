import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { decodePrefsCookie, PREFS_COOKIE, type Prefs } from '@gamecentral/shared';

/** The viewer's display preferences, from the cookie (kept in sync with the DB on save). */
export const getPrefs = cache(async (): Promise<Prefs> => {
  const store = await cookies();
  return decodePrefsCookie(store.get(PREFS_COOKIE)?.value);
});
