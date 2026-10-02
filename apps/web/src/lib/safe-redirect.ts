/**
 * Only allow paths on this site (prevents open redirects via ?next=). Browsers read `\` as `/`
 * and drop tabs and newlines from URLs, so `/\evil.com` and `/<tab>/evil.com` both lead to
 * evil.com: anything with a backslash, whitespace, a control character or an encoded slash or
 * backslash is refused, and what's left must still resolve to this origin.
 */
export function safeNext(next: string | string[] | null | undefined, fallback = '/'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2048) return fallback;
  if (/[\\\s\p{Cc}]|%2f|%5c/iu.test(next)) return fallback;
  try {
    if (new URL(next, 'http://x').origin !== 'http://x') return fallback;
  } catch {
    return fallback;
  }
  return next;
}
