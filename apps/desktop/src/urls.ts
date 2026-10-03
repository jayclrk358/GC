// Where the app's window may go. Game Central itself opens in the window; so do the sign-in and payment
// pages it sends you to (they send you straight back). Every other link opens in your browser.

/** Sign-in (Discord, Google, Twitch, Steam) and payment (Stripe) pages. */
const TRUSTED_HOSTS = new Set([
  'discord.com',
  'accounts.google.com',
  'accounts.youtube.com',
  'id.twitch.tv',
  'www.twitch.tv',
  'steamcommunity.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);

export type Navigation = 'allow' | 'external' | 'block';

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The origin of a URL, or '' if it isn't one. */
export function originOf(url: string): string {
  const u = parse(url);
  return u && (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin : '';
}

/** Whether the window may go to `url` itself, should hand it to the browser, or ignore it. */
export function navigationFor(url: string, appOrigin: string): Navigation {
  const u = parse(url);
  if (!u) return 'block';
  if (u.origin === appOrigin) return 'allow';
  if (u.protocol === 'https:' && TRUSTED_HOSTS.has(u.hostname)) return 'allow';
  if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') {
    return 'external';
  }
  return 'block';
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A server address as typed ("gamecentral.example.com", "https://gamecentral.example.com/c/foo") as the
 * site's origin, or null if it isn't usable. Plain http is only for this computer (testing).
 */
export function serverOrigin(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const u = parse(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  if (!u || !u.hostname) return null;
  if (u.protocol === 'https:') return u.origin;
  if (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname)) return u.origin;
  return null;
}

/**
 * A path on the app's site to go to, from a ?next= (the same rules as the site's own): it must
 * start with one slash and stay on the site. Anything else is the home page.
 */
export function sitePath(next: string | null | undefined): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2048) return '/';
  if (/[\\\s\p{Cc}]|%2f|%5c/iu.test(next)) return '/';
  try {
    return new URL(next, 'http://x').origin === 'http://x' ? next : '/';
  } catch {
    return '/';
  }
}

/**
 * The site asking the app to sign in with Discord, Google or Twitch: a link to its own
 * /desktop/sign-in page (without a challenge, which only the browser's copy of the link has).
 */
export function signInRequest(
  url: string,
  appOrigin: string,
): { provider: string; next: string } | null {
  const u = parse(url);
  if (!u || u.origin !== appOrigin || u.pathname !== '/desktop/sign-in') return null;
  if (u.searchParams.has('challenge')) return null;
  const provider = u.searchParams.get('provider') ?? '';
  if (!/^[a-z]{2,20}$/.test(provider)) return null;
  return { provider, next: sitePath(u.searchParams.get('next')) };
}

/** The one-time code in a gamecentral://auth?code=… link from the browser, if that's what it is. */
export function handoffCode(url: string): string | null {
  const u = parse(url);
  if (!u || u.protocol !== 'gamecentral:' || u.hostname !== 'auth') return null;
  if (u.pathname !== '' && u.pathname !== '/') return null;
  const code = u.searchParams.get('code') ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(code) ? code : null;
}
