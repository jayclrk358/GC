import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { env } from '../env';
import { BlockedAddressError, isIpLiteral, isPublicAddress, resolveTarget } from './ssrf';

export interface SafeFetchResult {
  /** Final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  /** True when the body was cut off at maxBytes. */
  truncated: boolean;
}

export interface SafeFetchOptions {
  accept: string;
  maxBytes: number;
  /** Refuse (rather than truncate) bodies over maxBytes, e.g. for images. */
  strictSize?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
  /** POST a body (webhooks). Redirects are never followed for these. */
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  userAgent?: string;
  /**
   * Called with each hop's vetted address (redirects included) before connecting to it, e.g.
   * to rate limit by site and IP. Throw to stop the fetch.
   */
  onConnect?: (target: { host: string; ip: string }) => void | Promise<void>;
}

const USER_AGENT = 'GameCentralBot/1.0 (link previews; +https://gamecentral.app)';

function assertFetchable(url: URL, allowPrivate: boolean) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedAddressError();
  if (url.username || url.password) throw new BlockedAddressError();
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  // Only the web ports, so previews can't be used to poke at other services.
  if (!allowPrivate && port !== 80 && port !== 443) throw new BlockedAddressError();
}

async function requestOnce(url: URL, opts: SafeFetchOptions, allowPrivate: boolean) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  // Resolve and vet once, then pin the connection to that address (no DNS rebinding).
  const target = await resolveTarget(host, port, { allowPrivate });
  await opts.onConnect?.({ host, ip: target.ip });
  return sendPinned(url, opts, target.ip);
}

/** One request to `url`, connecting to `ip` (already vetted) whatever the URL's host resolves to. */
function sendPinned(url: URL, opts: SafeFetchOptions, ip: string) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const family = ip.includes(':') ? 6 : 4;
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address: ip, family },
      ]);
    } else callback(null, ip, family);
  };
  const lib = url.protocol === 'https:' ? https : http;
  const timeoutMs = opts.timeoutMs ?? 6000;

  return new Promise<{
    status: number;
    location: string | null;
    contentType: string;
    body: Buffer;
    truncated: boolean;
  }>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: host,
        port,
        path: `${url.pathname}${url.search}`,
        method: opts.method ?? 'GET',
        agent: false,
        lookup,
        servername: isIpLiteral(host) ? undefined : host,
        headers: {
          'user-agent': opts.userAgent ?? USER_AGENT,
          accept: opts.accept,
          'accept-language': 'en',
          ...(opts.body !== undefined
            ? { 'content-length': String(Buffer.byteLength(opts.body)) }
            : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, body: Buffer.alloc(0), truncated: false });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (opts.strictSize && declared > opts.maxBytes) {
          req.destroy();
          reject(new Error('Response too large'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > opts.maxBytes) {
            if (opts.strictSize) {
              req.destroy();
              reject(new Error('Response too large'));
              return;
            }
            chunks.push(chunk.subarray(0, chunk.length - (size - opts.maxBytes)));
            truncated = true;
            res.destroy();
            resolve({ status, location, contentType, body: Buffer.concat(chunks), truncated });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ status, location, contentType, body: Buffer.concat(chunks), truncated }),
        );
        res.on('error', reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Timed out')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(opts.body);
  });
}

/**
 * GET a user-supplied URL safely: every hop (including redirects) is resolved and checked
 * against the SSRF guard, the connection is pinned to the vetted IP, only web ports are
 * allowed, and bodies are size- and time-limited.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const allowPrivate = env().SERVER_QUERY_ALLOW_PRIVATE;
  let url = new URL(rawUrl);
  const maxRedirects = opts.maxRedirects ?? 3;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    assertFetchable(url, allowPrivate);
    const res = await requestOnce(url, opts, allowPrivate);
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, url);
      continue;
    }
    return {
      url: url.toString(),
      status: res.status,
      contentType: res.contentType,
      body: res.body,
      truncated: res.truncated,
    };
  }
  throw new Error('Too many redirects');
}

/**
 * GET from an address resolveTarget already vetted, on any port (a game server's own HTTP status
 * page): connects to that IP only, never follows a redirect (a 3xx comes back as it is), and
 * refuses bodies over maxBytes.
 */
export async function pinnedGet(
  target: { ip: string; port: number; host: string },
  path: string,
  opts: { accept: string; maxBytes: number; timeoutMs?: number },
): Promise<{ status: number; contentType: string; body: Buffer }> {
  if (!isPublicAddress(target.ip, env().SERVER_QUERY_ALLOW_PRIVATE)) {
    throw new BlockedAddressError();
  }
  // Connect to the vetted IP itself; the name the owner entered only goes in the Host header.
  const origin = `http://${target.ip.includes(':') ? `[${target.ip}]` : target.ip}:${target.port}`;
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) throw new BlockedAddressError();
  const name = /^[a-z0-9.-]+$/i.test(target.host) ? target.host : null;
  const res = await sendPinned(
    url,
    {
      ...opts,
      strictSize: true,
      userAgent: 'GameCentralBot/1.0 (server status)',
      headers: name ? { host: target.port === 80 ? name : `${name}:${target.port}` } : {},
    },
    target.ip,
  );
  return { status: res.status, contentType: res.contentType, body: res.body };
}

/**
 * POST to a user-supplied URL (webhooks) behind the same guard as safeFetch. Redirects aren't
 * followed: the caller gets the 3xx status back.
 */
export async function safePost(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  opts: { timeoutMs?: number; userAgent?: string } = {},
): Promise<SafeFetchResult> {
  const allowPrivate = env().SERVER_QUERY_ALLOW_PRIVATE;
  const url = new URL(rawUrl);
  assertFetchable(url, allowPrivate);
  const res = await requestOnce(
    url,
    {
      accept: 'application/json, */*;q=0.5',
      maxBytes: 16_384,
      method: 'POST',
      body,
      headers,
      timeoutMs: opts.timeoutMs ?? 8000,
      userAgent: opts.userAgent,
    },
    allowPrivate,
  );
  return {
    url: url.toString(),
    status: res.status,
    contentType: res.contentType,
    body: res.body,
    truncated: res.truncated,
  };
}
