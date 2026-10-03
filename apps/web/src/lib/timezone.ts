import 'server-only';
import { cookies } from 'next/headers';
import { isValidTimeZone } from '@gamecentral/shared';

/** Set by the browser (see TZ_SCRIPT) so pages can show times on the viewer's own clock. */
export const TZ_COOKIE = 'mx-tz';

/** The viewer's time zone, or null on a first visit (before the browser has said). */
export async function getViewerTimeZone(): Promise<string | null> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  return value && isValidTimeZone(decodeURIComponent(value)) ? decodeURIComponent(value) : null;
}
