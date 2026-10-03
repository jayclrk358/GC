import { describe, expect, it } from 'vitest';
import {
  handoffCode,
  navigationFor,
  originOf,
  serverOrigin,
  signInRequest,
  sitePath,
} from './urls';

const app = 'https://gamecentral.example.com';

describe('navigationFor', () => {
  it('keeps Game Central in the window', () => {
    expect(navigationFor('https://gamecentral.example.com/c/foo/chat/general', app)).toBe('allow');
  });

  it('keeps sign-in and payment pages in the window', () => {
    expect(navigationFor('https://discord.com/oauth2/authorize?client_id=1', app)).toBe('allow');
    expect(navigationFor('https://steamcommunity.com/openid/login', app)).toBe('allow');
    expect(navigationFor('https://checkout.stripe.com/c/pay/cs_test', app)).toBe('allow');
  });

  it('sends other sites to the browser', () => {
    expect(navigationFor('https://media.gamecentral.example.com/u/abc.webp', app)).toBe('external');
    expect(navigationFor('https://youtube.com/watch?v=1', app)).toBe('external');
    expect(navigationFor('mailto:hi@example.com', app)).toBe('external');
    // Only https for the trusted pages, and only those exact hosts.
    expect(navigationFor('http://discord.com/', app)).toBe('external');
    expect(navigationFor('https://discord.com.evil.example/', app)).toBe('external');
  });

  it('ignores anything else', () => {
    expect(navigationFor('file:///C:/Windows/notepad.exe', app)).toBe('block');
    expect(navigationFor('javascript:alert(1)', app)).toBe('block');
    expect(navigationFor('not a url', app)).toBe('block');
  });
});

describe('serverOrigin', () => {
  it('accepts an address with or without https', () => {
    expect(serverOrigin('gamecentral.example.com')).toBe(app);
    expect(serverOrigin(' https://gamecentral.example.com/c/foo ')).toBe(app);
    expect(serverOrigin('https://192.168.1.50')).toBe('https://192.168.1.50');
  });

  it('only allows plain http on this computer', () => {
    expect(serverOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(serverOrigin('http://gamecentral.example.com')).toBeNull();
  });

  it('rejects things that are not web addresses', () => {
    expect(serverOrigin('')).toBeNull();
    expect(serverOrigin('ftp://example.com')).toBeNull();
    expect(serverOrigin('file:///C:/')).toBeNull();
  });
});

describe('originOf', () => {
  it('is empty for non-web URLs', () => {
    expect(originOf('https://a.example/x')).toBe('https://a.example');
    expect(originOf('file:///C:/')).toBe('');
  });
});

const code = 'A'.repeat(21) + '-_' + 'b'.repeat(20);

describe('signInRequest', () => {
  it('spots the site asking the app to sign in', () => {
    expect(
      signInRequest(`${app}/desktop/sign-in?provider=google&next=%2Fc%2Ffoo%3Ftab%3D1`, app),
    ).toEqual({ provider: 'google', next: '/c/foo?tab=1' });
    expect(signInRequest(`${app}/desktop/sign-in?provider=discord`, app)).toEqual({
      provider: 'discord',
      next: '/',
    });
  });

  it('leaves everything else alone', () => {
    // The browser's copy of the link.
    expect(signInRequest(`${app}/desktop/sign-in?provider=google&challenge=x`, app)).toBeNull();
    expect(signInRequest(`https://evil.example/desktop/sign-in?provider=google`, app)).toBeNull();
    expect(signInRequest(`${app}/sign-in?provider=google`, app)).toBeNull();
    expect(signInRequest(`${app}/desktop/sign-in?provider=Goo%20gle`, app)).toBeNull();
    expect(signInRequest(`${app}/desktop/sign-in`, app)).toBeNull();
  });

  it('never sends you off the site afterwards', () => {
    for (const next of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '/%2Fevil.example',
      '/\tx',
    ]) {
      expect(
        signInRequest(
          `${app}/desktop/sign-in?provider=google&next=${encodeURIComponent(next)}`,
          app,
        )?.next,
      ).toBe('/');
    }
  });
});

describe('sitePath', () => {
  it('keeps paths on the site', () => {
    expect(sitePath('/c/foo/chat/general')).toBe('/c/foo/chat/general');
    expect(sitePath(null)).toBe('/');
    expect(sitePath('//evil.example/x')).toBe('/');
  });
});

describe('handoffCode', () => {
  it("reads the code from the browser's link", () => {
    expect(handoffCode(`gamecentral://auth?code=${code}`)).toBe(code);
    expect(handoffCode(`gamecentral://auth/?code=${code}`)).toBe(code);
  });

  it('ignores anything else', () => {
    expect(handoffCode(`gamecentral://auth?code=short`)).toBeNull();
    expect(handoffCode(`gamecentral://other?code=${code}`)).toBeNull();
    expect(handoffCode(`gamecentral://auth/extra?code=${code}`)).toBeNull();
    expect(handoffCode(`https://auth?code=${code}`)).toBeNull();
    expect(handoffCode(`gamecentral://auth?code=${code}<script>`)).toBeNull();
    expect(handoffCode('not a url')).toBeNull();
  });
});
