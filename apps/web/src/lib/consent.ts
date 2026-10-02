// The visitor's cookie choice, read by the server (root layout) and the browser alike.
//
// Necessary cookies (signing in, bot checks on forms, this choice, the age check, and settings
// someone changes themselves) are always set. The only optional one is the time zone, which the
// browser would otherwise report on every visit so event times show on the viewer's clock.

export const CONSENT_COOKIE = 'mx-cookies';
/** Raise when the cookies we ask about change, to ask everyone again. */
const CONSENT_VERSION = 1;
/** How long a choice is kept before asking again (six months). */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export type CookieChoice = 'all' | 'necessary';

/** The choice stored in the cookie, or null when there isn't one (or it's from an older ask). */
export function parseConsent(value: string | null | undefined): CookieChoice | null {
  const m = /^(\d+)\.(all|necessary)$/.exec(value ?? '');
  return m && Number(m[1]) === CONSENT_VERSION ? (m[2] as CookieChoice) : null;
}

export function consentValue(choice: CookieChoice): string {
  return `${CONSENT_VERSION}.${choice}`;
}

/** The browser's side: what was chosen, from document.cookie. */
export function readConsent(): CookieChoice | null {
  if (typeof document === 'undefined') return null;
  const pair = document.cookie.split('; ').find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(pair?.slice(CONSENT_COOKIE.length + 1));
}

/** Whether optional cookies (the time zone) may be set. */
export function preferencesAllowed(): boolean {
  return readConsent() === 'all';
}

/** Told when the choice changes, so whatever depends on it can catch up. */
export const CONSENT_CHANGED = 'mx-cookies-changed';

const TZ_COOKIE_NAME = 'mx-tz';

/**
 * Remember the browser's time zone (only with consent). Returns whether it changed, i.e. whether
 * pages showing times would now look different.
 */
export function rememberTimeZone(): boolean {
  if (!preferencesAllowed()) return false;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const value = zone ? encodeURIComponent(zone) : '';
  if (!value || document.cookie.split('; ').includes(`${TZ_COOKIE_NAME}=${value}`)) return false;
  document.cookie = `${TZ_COOKIE_NAME}=${value}; path=/; max-age=31536000; samesite=lax`;
  return true;
}

export function forgetTimeZone(): void {
  document.cookie = `${TZ_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}
