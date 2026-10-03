import { BlockList, isIP } from 'node:net';

// Abuse limits for the realtime server: per address, per account and per socket. All per node
// (with several realtime nodes, each enforces its own), which is enough to stop one client making
// the server do unbounded work.

/** `capacity` actions in a burst, refilled at `perSecond`. */
export class TokenBucket {
  private readonly capacity: number;
  private readonly perSecond: number;
  private tokens: number;
  private at: number;

  constructor(capacity: number, perSecond: number, now = Date.now()) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.tokens = capacity;
    this.at = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.at) / 1000) * this.perSecond);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Per-socket allowances, [burst, per second], for the events that cost the server something. */
const EVENT_RATES = new Map<string, readonly [number, number]>([
  // Opening chat subscribes to every channel at once, and so does reconnecting. Refused ones
  // count too: each is a database lookup.
  ['subscribe', [250, 3]],
  // Each one up to 200 people (a Redis lookup).
  ['presence:watch', [30, 1]],
  ['presence:state', [10, 0.2]],
  // The composer sends one every 3 s at most.
  ['typing', [5, 0.5]],
]);
/** Everything else (unsubscribing, unwatching): cheap, but leaving a page sends a burst. */
const OTHER_RATE = [600, 20] as const;
/** Refused events a socket may send before it's disconnected. */
const STRIKES = [20, 0.1] as const;

export type Verdict = 'ok' | 'drop' | 'disconnect';

/** Rate limits for one socket's incoming events. */
export class EventLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly strikes: TokenBucket;

  constructor(now = Date.now()) {
    this.strikes = new TokenBucket(STRIKES[0], STRIKES[1], now);
  }

  /** Whether to handle an event, drop it, or (it keeps happening) give up on the socket. */
  check(event: string, now = Date.now()): Verdict {
    const key = EVENT_RATES.has(event) ? event : '*';
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const [burst, perSecond] = EVENT_RATES.get(key) ?? OTHER_RATE;
      bucket = new TokenBucket(burst, perSecond, now);
      this.buckets.set(key, bucket);
    }
    if (bucket.take(now)) return 'ok';
    return this.strikes.take(now) ? 'drop' : 'disconnect';
  }
}

/**
 * Which game servers one socket keeps on the fast polling tier. Watching a server makes Game Central
 * poll it every minute, so a socket may only start that for a few different servers in a while.
 */
export class HotAllowance {
  /** Endpoints this socket keeps hot (it subscribed to them within its allowance). */
  readonly endpoints = new Set<string>();
  private readonly started: number[] = [];
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = 30, windowMs = 10 * 60_000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Whether this socket may keep an endpoint hot (one it already does always may). */
  allow(endpointId: string, now = Date.now()): boolean {
    if (this.endpoints.has(endpointId)) return true;
    while (this.started.length && now - this.started[0]! >= this.windowMs) this.started.shift();
    if (this.started.length >= this.max) return false;
    this.started.push(now);
    this.endpoints.add(endpointId);
    return true;
  }
}

/** Open connections per key (an address, an account), to cap them. */
export class ConnectionCounts {
  private readonly counts = new Map<string, number>();

  /** Count one more connection for `key`, unless it already has `max`. */
  acquire(key: string, max: number): boolean {
    const n = this.counts.get(key) ?? 0;
    if (n >= max) return false;
    this.counts.set(key, n + 1);
    return true;
  }

  release(key: string): void {
    const n = (this.counts.get(key) ?? 0) - 1;
    if (n > 0) this.counts.set(key, n);
    else this.counts.delete(key);
  }

  count(key: string): number {
    return this.counts.get(key) ?? 0;
  }
}

/** Where a proxy in front of us can be: loopback and private networks (Docker's included). */
const proxies = new BlockList();
proxies.addSubnet('127.0.0.0', 8, 'ipv4');
proxies.addSubnet('10.0.0.0', 8, 'ipv4');
proxies.addSubnet('172.16.0.0', 12, 'ipv4');
proxies.addSubnet('192.168.0.0', 16, 'ipv4');
proxies.addAddress('::1', 'ipv6');
proxies.addSubnet('fc00::', 7, 'ipv6');

/** An IPv4 address mapped into IPv6 (how Node reports IPv4 peers on a dual-stack socket). */
const unmap = (ip: string) => (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip) ? ip.slice(7) : ip);

/**
 * The address a connection came from. Behind Caddy (the only way in, in production) the peer is
 * Caddy, which sets X-Forwarded-For to whoever connected to it, replacing what the browser sent
 * (it trusts no proxies in front of it). So only the last entry, the one Caddy wrote, is used,
 * and only when the peer is on a private network, i.e. is the proxy: on a direct connection the
 * header is the client's own say-so.
 */
export function clientIp(peer: string, forwardedFor: string | string[] | undefined): string {
  const from = unmap(peer);
  const family = isIP(from);
  const viaProxy = family !== 0 && proxies.check(from, family === 4 ? 'ipv4' : 'ipv6');
  if (!viaProxy || !forwardedFor) return from;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const last = unmap(header.split(',').at(-1)?.trim() ?? '');
  return isIP(last) ? last : from;
}

/**
 * What to count connections against for an address: the address itself for IPv4, its /64 for
 * IPv6 (one home or server is usually given a whole /64).
 */
export function addressKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const [head = '', tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  // "::" stands for as many zero groups as are missing (an IPv4 tail fills two).
  const width = left.length + right.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  const groups = tail === undefined ? left : [...left, ...Array(8 - width).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}
