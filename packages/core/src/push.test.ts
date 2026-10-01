import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isAllowedPushEndpoint', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function check(allowPrivate: boolean) {
    vi.stubEnv('SERVER_QUERY_ALLOW_PRIVATE', allowPrivate ? 'true' : 'false');
    vi.resetModules();
    return (await import('./services/push')).isAllowedPushEndpoint;
  }

  it('only accepts the browsers’ push services', async () => {
    const ok = await check(false);
    expect(ok('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(ok('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(ok('https://web.push.apple.com/QGx')).toBe(true);
    expect(ok('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(ok('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(ok('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(ok('https://evil-fcm.googleapis.com.attacker.net/x')).toBe(false);
    expect(ok('https://127.0.0.1/push')).toBe(false);
    expect(ok('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(ok('not a url')).toBe(false);
  });

  it('lets tests use the local fixture', async () => {
    const ok = await check(true);
    expect(ok('http://127.0.0.1:25591/push/abc')).toBe(true);
  });
});
