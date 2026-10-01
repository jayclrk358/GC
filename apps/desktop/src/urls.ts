// Where the app's window may go. Magnox itself opens in the window; so do the sign-in and payment
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
 * A server address as typed ("magnox.example.com", "https://magnox.example.com/c/foo") as the
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
