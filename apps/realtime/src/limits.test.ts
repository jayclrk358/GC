import { describe, expect, it } from 'vitest';
import {
  addressKey,
  clientIp,
  ConnectionCounts,
  EventLimiter,
  HotAllowance,
  TokenBucket,
} from './limits';

describe('TokenBucket', () => {
  it('allows a burst, then refills over time', () => {
    const bucket = new TokenBucket(3, 1, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(bucket.take(500)).toBe(false);
    expect(bucket.take(1000)).toBe(true);
    // Never more than the burst, however long it sat.
    const later = 1_000_000;
    expect([1, 2, 3, 4].map(() => bucket.take(later))).toEqual([true, true, true, false]);
  });
});

describe('EventLimiter', () => {
  it('lets a page subscribe to every channel at once', () => {
    const limiter = new EventLimiter(0);
    for (let i = 0; i < 200; i++) expect(limiter.check('subscribe', 0)).toBe('ok');
  });

  it('drops events over the allowance, then disconnects a socket that keeps on', () => {
    const limiter = new EventLimiter(0);
    for (let i = 0; i < 5; i++) expect(limiter.check('typing', 0)).toBe('ok');
    const verdicts = Array.from({ length: 30 }, () => limiter.check('typing', 0));
    expect(verdicts.slice(0, 20).every((v) => v === 'drop')).toBe(true);
    expect(verdicts.at(-1)).toBe('disconnect');
  });

  it('keeps separate allowances per event', () => {
    const limiter = new EventLimiter(0);
    for (let i = 0; i < 5; i++) limiter.check('typing', 0);
    expect(limiter.check('typing', 0)).toBe('drop');
    expect(limiter.check('presence:watch', 0)).toBe('ok');
    expect(limiter.check('unsubscribe', 0)).toBe('ok');
  });

  it('treats prototype names as ordinary events', () => {
    const limiter = new EventLimiter(0);
    expect(limiter.check('constructor', 0)).toBe('ok');
    expect(limiter.check('__proto__', 0)).toBe('ok');
  });
});

describe('HotAllowance', () => {
  it('caps how many new servers a socket heats in a window', () => {
    const hot = new HotAllowance(2, 1000);
    expect(hot.allow('a', 0)).toBe(true);
    expect(hot.allow('b', 0)).toBe(true);
    expect(hot.allow('c', 0)).toBe(false);
    // Ones it already keeps hot stay allowed.
    expect(hot.allow('a', 10)).toBe(true);
    expect([...hot.endpoints]).toEqual(['a', 'b']);
    expect(hot.allow('c', 1000)).toBe(true);
  });
});

describe('ConnectionCounts', () => {
  it('caps connections per key and frees them on release', () => {
    const counts = new ConnectionCounts();
    expect(counts.acquire('ip:1', 2)).toBe(true);
    expect(counts.acquire('ip:1', 2)).toBe(true);
    expect(counts.acquire('ip:1', 2)).toBe(false);
    expect(counts.acquire('ip:2', 2)).toBe(true);
    counts.release('ip:1');
    expect(counts.acquire('ip:1', 2)).toBe(true);
    counts.release('ip:2');
    expect(counts.count('ip:2')).toBe(0);
  });
});

describe('clientIp', () => {
  it('uses the address Caddy forwarded when the peer is the proxy', () => {
    expect(clientIp('::ffff:172.18.0.5', '203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp('10.0.0.2', '2001:db8::1')).toBe('2001:db8::1');
  });

  it('trusts only the last entry, the one the proxy wrote', () => {
    expect(clientIp('172.18.0.5', '1.1.1.1, 203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp('172.18.0.5', ['1.1.1.1', '203.0.113.9'])).toBe('203.0.113.9');
  });

  it('ignores the header on a direct connection', () => {
    expect(clientIp('198.51.100.7', '203.0.113.9')).toBe('198.51.100.7');
    expect(clientIp('::ffff:198.51.100.7', undefined)).toBe('198.51.100.7');
  });

  it('falls back to the peer when the header is junk', () => {
    expect(clientIp('172.18.0.5', 'nonsense')).toBe('172.18.0.5');
    expect(clientIp('127.0.0.1', '')).toBe('127.0.0.1');
  });
});

describe('addressKey', () => {
  it('counts IPv4 addresses one by one and IPv6 by /64', () => {
    expect(addressKey('203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('1:2::4:5:6:7:8')).toBe('1:2:0:4::/64');
  });
});
