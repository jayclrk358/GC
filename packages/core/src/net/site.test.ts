import { describe, expect, it } from 'vitest';
import { siteOf } from './site';

describe('siteOf', () => {
  it.each([
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['a.b.c.random123.example.com', 'example.com'],
    ['EXAMPLE.com.', 'example.com'],
    ['news.bbc.co.uk', 'bbc.co.uk'],
    ['x.y.example.com.au', 'example.com.au'],
    ['shop.example.ac.jp', 'example.ac.jp'],
    ['co.uk', 'co.uk'],
    ['localhost', 'localhost'],
    ['203.0.113.9', '203.0.113.9'],
    ['[2001:db8::1]', '2001:db8::1'],
  ])('%s → %s', (host, site) => {
    expect(siteOf(host)).toBe(site);
  });
});
