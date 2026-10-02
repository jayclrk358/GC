import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-redirect';

describe('safeNext', () => {
  it.each([
    '/',
    '/c/blockhaven/chat',
    '/c/blockhaven/t/0195?page=2#post-3',
    '/search?q=a+b%26c',
    '/explore?tag=pvp&page=2',
  ])('keeps the path %s', (next) => {
    expect(safeNext(next)).toBe(next);
  });

  it.each([
    ['another site', 'https://evil.com'],
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash after the slash', '/\\evil.com'],
    ['a backslash later on', '/c/x/..\\..\\evil.com'],
    ['a tab between the slashes', '/\t/evil.com'],
    ['a newline between the slashes', '/\n/evil.com'],
    ['a leading space', ' /evil'],
    ['a control character', '/\u0000/evil.com'],
    ['an encoded slash', '/%2F/evil.com'],
    ['an encoded backslash', '/%5cevil.com'],
    ['a relative path', 'evil.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['nothing', ''],
  ])('refuses %s', (_name, next) => {
    expect(safeNext(next)).toBe('/');
  });

  it('falls back for missing or repeated values', () => {
    expect(safeNext(undefined, '/home')).toBe('/home');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(['/a', '/b'])).toBe('/');
  });
});
