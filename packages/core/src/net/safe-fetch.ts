import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { env } from '../env';
import { BlockedAddressError, isIpLiteral, resolveTarget } from './ssrf';

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
}

const USER_AGENT = 'MagnoxBot/1.0 (link previews; +https://github.com/magnox)';

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
  const family = target.ip.includes(':') ? 6 : 4;
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address: target.ip, family },
      ]);
    } else callback(null, target.ip, family);
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
        method: 'GET',
        agent: false,
        lookup,
        servername: isIpLiteral(host) ? undefined : host,
        headers: { 'user-agent': USER_AGENT, accept: opts.accept, 'accept-language': 'en' },
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
    req.end();
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
