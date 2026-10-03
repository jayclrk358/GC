import { z } from 'zod';

// Custom domains: a community's own address (forum.myclan.gg) for its public pages.

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** A hostname someone can point at Game Central: at least two labels, a real-looking TLD, no IPs. */
export function isValidDomain(domain: string): boolean {
  if (domain.length > 253 || !domain.includes('.')) return false;
  const labels = domain.split('.');
  const tld = labels[labels.length - 1]!;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return false;
  return labels.every((l) => LABEL.test(l));
}

export const customDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) =>
    s
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, ''),
  )
  .refine(isValidDomain, 'Enter a domain like forum.example.com (no https:// or paths).');

/** The DNS TXT record that proves a domain is yours. */
export function domainVerifyRecord(domain: string, token: string) {
  return { name: `_gamecentral.${domain}`, value: `gamecentral-verify=${token}` };
}

/**
 * Where a request on a community's own domain goes: its pages and the files they need are served
 * there; everything else (signing in, settings, other communities) is on the main site.
 */
export function customDomainRoute(
  pathname: string,
  slug: string,
): { kind: 'rewrite'; path: string } | { kind: 'pass' } | { kind: 'redirect' } {
  if (pathname === '/' || pathname === '') return { kind: 'rewrite', path: `/c/${slug}` };
  if (pathname === `/c/${slug}` || pathname.startsWith(`/c/${slug}/`)) return { kind: 'pass' };
  if (
    /^\/(?:_next|api|media|emoji|icons)\//.test(pathname) ||
    /^\/(?:sw\.js|manifest\.webmanifest|robots\.txt|favicon\.ico|icon\.svg|apple-icon\.png)$/.test(
      pathname,
    )
  ) {
    return { kind: 'pass' };
  }
  return { kind: 'redirect' };
}
