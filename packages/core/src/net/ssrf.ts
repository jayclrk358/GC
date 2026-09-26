import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { env } from '../env';

/** Thrown for any address we refuse to contact. The message is deliberately generic. */
export class BlockedAddressError extends Error {
  constructor() {
    super("That address can't be used. Enter the public address of your server.");
    this.name = 'BlockedAddressError';
  }
}

export class UnresolvableHostError extends Error {
  constructor() {
    super("We couldn't find that address. Check the hostname and try again.");
    this.name = 'UnresolvableHostError';
  }
}

const TEST_ALLOWED = new Set(['private', 'loopback', 'uniqueLocal']);

/** Strict literal check: dotted-quad IPv4 or IPv6 only (no "127.1" or hex shorthands). */
export function isIpLiteral(value: string): boolean {
  return ipaddr.IPv4.isValidFourPartDecimal(value) || ipaddr.IPv6.isValid(value);
}

/**
 * True only for globally routable unicast addresses. IPv4-mapped IPv6 addresses are unwrapped
 * first so `::ffff:127.0.0.1` can't sneak past. Private ranges are only allowed when
 * SERVER_QUERY_ALLOW_PRIVATE is on (test fixtures), and that flag is refused in production.
 */
export function isPublicAddress(ip: string, allowPrivate = false): boolean {
  if (!isIpLiteral(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  const range = addr.range();
  if (range === 'unicast') return true;
  return allowPrivate && TEST_ALLOWED.has(range);
}

export interface ResolvedTarget {
  ip: string;
  port: number;
  /** Host we actually connected to (after SRV), for display only. */
  host: string;
}

type Resolver = {
  lookup: (host: string) => Promise<{ address: string; family: number }[]>;
  resolveSrv: (
    name: string,
  ) => Promise<{ name: string; port: number; priority: number; weight: number }[]>;
};

const systemResolver: Resolver = {
  lookup: (host) => dns.lookup(host, { all: true, verbatim: true }),
  resolveSrv: (name) => dns.resolveSrv(name),
};

/**
 * Resolve a user-supplied host to a single vetted IP. Every resolved address must be public;
 * a hostname with any private record is rejected outright (defeats split-horizon tricks).
 * The caller must connect to the returned IP, never re-resolve the hostname (DNS rebinding).
 */
export async function resolveTarget(
  host: string,
  port: number,
  opts: { srvService?: string; resolver?: Resolver; allowPrivate?: boolean } = {},
): Promise<ResolvedTarget> {
  const resolver = opts.resolver ?? systemResolver;
  const allowPrivate = opts.allowPrivate ?? env().SERVER_QUERY_ALLOW_PRIVATE;
  let targetHost = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  let targetPort = port;

  if (isIpLiteral(targetHost)) {
    if (!isPublicAddress(targetHost, allowPrivate)) throw new BlockedAddressError();
    return { ip: ipaddr.process(targetHost).toString(), port: targetPort, host: targetHost };
  }

  if (
    !/^[a-z0-9.-]+$/.test(targetHost) ||
    targetHost.endsWith('.local') ||
    targetHost === 'localhost'
  ) {
    throw new BlockedAddressError();
  }

  if (opts.srvService) {
    try {
      const records = await resolver.resolveSrv(`${opts.srvService}.${targetHost}`);
      const best = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
      if (best && /^[a-z0-9.-]+$/i.test(best.name)) {
        targetHost = best.name.toLowerCase().replace(/\.$/, '');
        targetPort = best.port;
      }
    } catch {
      // No SRV record: use the host as given.
    }
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolver.lookup(targetHost);
  } catch {
    throw new UnresolvableHostError();
  }
  if (addresses.length === 0) throw new UnresolvableHostError();
  if (addresses.some((a) => !isPublicAddress(a.address, allowPrivate)))
    throw new BlockedAddressError();
  const chosen = addresses.find((a) => a.family === 4) ?? addresses[0]!;
  return { ip: ipaddr.process(chosen.address).toString(), port: targetPort, host: targetHost };
}

/** The /24 (IPv4) or /48 (IPv6) network an address belongs to, for rate limiting. */
export function networkKey(ip: string): string {
  const addr = ipaddr.process(ip);
  if (addr.kind() === 'ipv4') return (addr as ipaddr.IPv4).octets.slice(0, 3).join('.');
  return (addr as ipaddr.IPv6).parts
    .slice(0, 3)
    .map((p) => p.toString(16))
    .join(':');
}
