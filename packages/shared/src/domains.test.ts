import { describe, expect, it } from 'vitest';
import {
  customDomainRoute,
  customDomainSchema,
  domainVerifyRecord,
  isValidDomain,
} from './domains';

describe('custom domains', () => {
  it('accepts real-looking domains only', () => {
    expect(isValidDomain('forum.example.com')).toBe(true);
    expect(isValidDomain('my-clan.gg')).toBe(true);
    expect(isValidDomain('xn--bcher-kva.example')).toBe(true);
    expect(isValidDomain('localhost')).toBe(false);
    expect(isValidDomain('192.168.1.10')).toBe(false);
    expect(isValidDomain('-bad.example.com')).toBe(false);
    expect(isValidDomain('bad-.example.com')).toBe(false);
    expect(isValidDomain('under_score.example.com')).toBe(false);
    expect(isValidDomain(`${'a'.repeat(64)}.com`)).toBe(false);
  });

  it('tidies what people paste', () => {
    expect(customDomainSchema.parse('  HTTPS://Forum.Example.com/path ')).toBe('forum.example.com');
    expect(customDomainSchema.parse('forum.example.com.')).toBe('forum.example.com');
    expect(customDomainSchema.safeParse('not a domain').success).toBe(false);
  });

  it('names the TXT record', () => {
    expect(domainVerifyRecord('forum.example.com', 'abc')).toEqual({
      name: '_magnox.forum.example.com',
      value: 'magnox-verify=abc',
    });
  });

  it('serves the community’s pages and sends the rest to the main site', () => {
    expect(customDomainRoute('/', 'neon')).toEqual({ kind: 'rewrite', path: '/c/neon' });
    expect(customDomainRoute('/c/neon', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/c/neon/forum', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/c/neonish', 'neon')).toEqual({ kind: 'redirect' });
    expect(customDomainRoute('/c/other', 'neon')).toEqual({ kind: 'redirect' });
    expect(customDomainRoute('/_next/static/chunks/a.js', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/api/domains/check', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/emoji/123', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/sw.js', 'neon')).toEqual({ kind: 'pass' });
    expect(customDomainRoute('/sign-in', 'neon')).toEqual({ kind: 'redirect' });
    expect(customDomainRoute('/settings/profile', 'neon')).toEqual({ kind: 'redirect' });
  });
});
