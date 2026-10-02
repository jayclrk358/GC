import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The test server listens on loopback, which the guard only allows in test mode.
process.env.SERVER_QUERY_ALLOW_PRIVATE = 'true';
const { pinnedGet } = await import('./safe-fetch');
const { BlockedAddressError } = await import('./ssrf');

const seen: { url: string; host: string }[] = [];
let port = 0;
const server = http.createServer((req, res) => {
  seen.push({ url: req.url ?? '', host: req.headers.host ?? '' });
  if (req.url === '/redirect') {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
  } else if (req.url === '/big') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('x'.repeat(10_000));
  } else {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"hostname":"Test"}');
  }
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const opts = { accept: 'application/json', maxBytes: 1000 };

describe('pinnedGet', () => {
  it('asks the vetted address, naming the host the owner entered', async () => {
    const res = await pinnedGet(
      { ip: '127.0.0.1', port, host: 'play.example.com' },
      '/dynamic.json',
      opts,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ hostname: 'Test' });
    expect(seen.at(-1)).toEqual({ url: '/dynamic.json', host: `play.example.com:${port}` });
  });

  it('never follows a redirect', async () => {
    const before = seen.length;
    const res = await pinnedGet({ ip: '127.0.0.1', port, host: '127.0.0.1' }, '/redirect', opts);
    expect(res.status).toBe(302);
    expect(res.body.length).toBe(0);
    expect(seen.length).toBe(before + 1);
  });

  it('refuses bodies over the limit', async () => {
    await expect(
      pinnedGet({ ip: '127.0.0.1', port, host: '127.0.0.1' }, '/big', opts),
    ).rejects.toThrow();
  });

  it('refuses addresses the guard blocks, and paths that leave the address', async () => {
    await expect(
      pinnedGet({ ip: '169.254.169.254', port: 80, host: 'x.example' }, '/', opts),
    ).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(
      pinnedGet({ ip: '127.0.0.1', port, host: '127.0.0.1' }, '//169.254.169.254/', opts),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });
});
