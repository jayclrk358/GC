import { describe, expect, it } from 'vitest';
import {
  BlockedAddressError,
  isPublicAddress,
  networkKey,
  resolveTarget,
  UnresolvableHostError,
} from './ssrf';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.5.4',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::7f00:1', // IPv4-compatible 127.0.0.1
    '::127.0.0.1',
    '::a9fe:a9fe', // IPv4-compatible 169.254.169.254
    '::808:808', // IPv4-compatible 8.8.8.8: still not a real IPv6 address
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '51.15.20.30', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it('rejects garbage', () => {
    expect(isPublicAddress('not-an-ip')).toBe(false);
    expect(isPublicAddress('1.2.3')).toBe(false);
  });

  it('only relaxes private/loopback in test mode', () => {
    expect(isPublicAddress('127.0.0.1', true)).toBe(true);
    expect(isPublicAddress('169.254.169.254', true)).toBe(false);
    expect(isPublicAddress('224.0.0.1', true)).toBe(false);
  });
});

function fakeResolver(
  a: Record<string, string[]>,
  srv: Record<string, { name: string; port: number }> = {},
) {
  return {
    lookup: async (host: string) => {
      const list = a[host];
      if (!list) throw new Error('ENOTFOUND');
      return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    resolveSrv: async (name: string) => {
      const r = srv[name];
      if (!r) throw new Error('ENODATA');
      return [{ ...r, priority: 0, weight: 0 }];
    },
  };
}

describe('resolveTarget', () => {
  it('resolves a public hostname to an IP', async () => {
    const r = await resolveTarget('play.example.com', 25565, {
      resolver: fakeResolver({
        'play.example.com': ['203.0.113.10'.replace('203.0.113', '51.15.20')],
      }),
      allowPrivate: false,
    });
    expect(r).toEqual({ ip: '51.15.20.10', port: 25565, host: 'play.example.com' });
  });

  it('follows Minecraft SRV records', async () => {
    const r = await resolveTarget('example.com', 25565, {
      srvService: '_minecraft._tcp',
      resolver: fakeResolver(
        { 'mc.example.net': ['51.15.20.11'] },
        { '_minecraft._tcp.example.com': { name: 'mc.example.net.', port: 25599 } },
      ),
      allowPrivate: false,
    });
    expect(r).toEqual({ ip: '51.15.20.11', port: 25599, host: 'mc.example.net' });
  });

  it('rejects hostnames with any private record', async () => {
    await expect(
      resolveTarget('mixed.example.com', 27015, {
        resolver: fakeResolver({ 'mixed.example.com': ['51.15.20.12', '10.0.0.5'] }),
        allowPrivate: false,
      }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('rejects an SRV record pointing inside the network', async () => {
    await expect(
      resolveTarget('example.com', 25565, {
        srvService: '_minecraft._tcp',
        resolver: fakeResolver(
          { 'internal.example.com': ['192.168.0.10'] },
          { '_minecraft._tcp.example.com': { name: 'internal.example.com', port: 25565 } },
        ),
        allowPrivate: false,
      }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('rejects literal private IPs and localhost names', async () => {
    for (const host of ['127.0.0.1', '[::1]', 'localhost', 'printer.local']) {
      await expect(
        resolveTarget(host, 1, { resolver: fakeResolver({}), allowPrivate: false }),
      ).rejects.toBeInstanceOf(BlockedAddressError);
    }
  });

  it('reports unknown hosts', async () => {
    await expect(
      resolveTarget('nope.example.com', 1, { resolver: fakeResolver({}), allowPrivate: false }),
    ).rejects.toBeInstanceOf(UnresolvableHostError);
  });

  it('computes network keys', () => {
    expect(networkKey('51.15.20.10')).toBe('51.15.20');
    expect(networkKey('2606:4700:4700::1111')).toBe('2606:4700:4700');
  });
});
