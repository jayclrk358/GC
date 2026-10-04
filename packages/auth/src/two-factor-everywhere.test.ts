import { createOTP } from '@better-auth/utils/otp';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createEmailVerificationToken } from 'better-auth/api';
import { symmetricDecrypt } from 'better-auth/crypto';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { beforeEach, describe, expect, it } from 'vitest';
import { codePageFor, twoFactorEverywhere, type TwoFactorEvent } from './two-factor-everywhere';

const BASE = 'http://localhost:3000';
const SECRET = 'test-secret-that-is-long-enough-for-better-auth';
const PASSWORD = 'correct-horse-battery-staple';

type Rows = Record<string, Record<string, unknown>[]>;

function setup() {
  const rows: Rows = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  const events: { event: TwoFactorEvent; left?: number }[] = [];
  const auth = betterAuth({
    baseURL: BASE,
    secret: SECRET,
    database: memoryAdapter(rows),
    emailAndPassword: { enabled: true },
    emailVerification: { autoSignInAfterVerification: true },
    rateLimit: { enabled: false },
    plugins: [
      twoFactor({ issuer: 'Test', allowPasswordless: true }),
      twoFactorEverywhere({
        notify: (event, _user, { backupCodesLeft }) => {
          events.push({ event, left: backupCodesLeft });
        },
      }),
    ],
  });
  return { auth, rows, events };
}

/** A browser's cookies, kept between requests. */
class Browser {
  cookies = new Map<string, string>();
  constructor(private auth: ReturnType<typeof setup>['auth']) {}

  async send(path: string, init: { method?: string; body?: unknown } = {}) {
    const res = await this.auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: init.method ?? (init.body ? 'POST' : 'GET'),
        headers: {
          origin: BASE,
          'content-type': 'application/json',
          cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        redirect: 'manual',
      }),
    );
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const [name, ...value] = pair!.split('=');
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim()));
      if (expired) this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value.join('='));
    }
    const text = await res.text();
    return {
      status: res.status,
      location: res.headers.get('location'),
      json: text ? JSON.parse(text) : null,
    };
  }

  has(cookie: string) {
    return [...this.cookies.keys()].some((k) => k.endsWith(cookie));
  }
}

async function currentCode(auth: ReturnType<typeof setup>['auth'], rows: Rows) {
  const ctx = await auth.$context;
  const secret = await symmetricDecrypt({
    key: ctx.secretConfig,
    data: rows.twoFactor![0]!.secret as string,
  });
  return createOTP(secret, { digits: 6, period: 30 }).totp();
}

async function backupCode(auth: ReturnType<typeof setup>['auth'], rows: Rows) {
  const ctx = await auth.$context;
  const codes = JSON.parse(
    await symmetricDecrypt({
      key: ctx.secretConfig,
      data: rows.twoFactor![0]!.backupCodes as string,
    }),
  ) as string[];
  return codes[0]!;
}

/** Sign up with a password and turn two-factor on. */
async function withTwoFactor(t: ReturnType<typeof setup>) {
  const b = new Browser(t.auth);
  const email = `p${Math.random().toString(36).slice(2)}@example.test`;
  await b.send('/sign-up/email', { body: { email, password: PASSWORD, name: 'Pat' } });
  const on = await b.send('/two-factor/enable', { body: { password: PASSWORD } });
  expect(on.status).toBe(200);
  const done = await b.send('/two-factor/verify-totp', {
    body: { code: await currentCode(t.auth, t.rows) },
  });
  expect(done.status).toBe(200);
  return { b, email };
}

/** Make the account's email unconfirmed again, so its confirmation link signs in. */
function unconfirm(rows: Rows, email: string) {
  const user = rows.user!.find((u) => u.email === email)!;
  user.emailVerified = false;
  return user;
}

async function confirmationLink(email: string) {
  const token = await createEmailVerificationToken(SECRET, email);
  return `/verify-email?token=${token}&callbackURL=${encodeURIComponent('/c/raid?tab=events')}`;
}

describe('two-factor everywhere', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('matches the sign-in endpoints Better Auth really has', () => {
    expect(t.auth.api.callbackOAuth.path).toBe('/callback/:id');
    expect(t.auth.api.signInSocial.path).toBe('/sign-in/social');
    expect(t.auth.api.verifyEmail.path).toBe('/verify-email');
  });

  it('emails when two-factor is turned on', async () => {
    await withTwoFactor(t);
    expect(t.events).toEqual([{ event: 'on', left: undefined }]);
  });

  it('asks for the code after a sign-in without a password, then finishes it', async () => {
    const { email } = await withTwoFactor(t);
    const user = unconfirm(t.rows, email);
    const sessionsBefore = t.rows.session!.length;

    const fresh = new Browser(t.auth);
    const res = await fresh.send(await confirmationLink(email));
    expect(res.status).toBe(302);
    expect(res.location).toBe(
      `${BASE}/sign-in/two-factor?next=${encodeURIComponent('/c/raid?tab=events')}`,
    );
    // No session yet: only the challenge.
    expect(fresh.has('session_token')).toBe(false);
    expect(fresh.has('two_factor')).toBe(true);
    expect(t.rows.session!.filter((s) => s.userId === user.id)).toHaveLength(sessionsBefore);

    const wrong = await fresh.send('/two-factor/verify-totp', { body: { code: '000000' } });
    expect(wrong.status).toBe(401);
    const ok = await fresh.send('/two-factor/verify-totp', {
      body: { code: await currentCode(t.auth, t.rows) },
    });
    expect(ok.status).toBe(200);
    expect(fresh.has('session_token')).toBe(true);
    const me = await fresh.send('/get-session');
    expect(me.json.user.email).toBe(email);
  });

  it('doesn’t ask again on a trusted device', async () => {
    const { email } = await withTwoFactor(t);
    unconfirm(t.rows, email);
    const fresh = new Browser(t.auth);
    await fresh.send(await confirmationLink(email));
    await fresh.send('/two-factor/verify-totp', {
      body: { code: await currentCode(t.auth, t.rows), trustDevice: true },
    });
    expect(fresh.has('trust_device')).toBe(true);
    await fresh.send('/sign-out', { body: {} });

    unconfirm(t.rows, email);
    const again = await fresh.send(await confirmationLink(email));
    expect(again.location).toBe('/c/raid?tab=events');
    expect(fresh.has('session_token')).toBe(true);
  });

  it('leaves a signed-in person signed in when they confirm their email', async () => {
    const { b, email } = await withTwoFactor(t);
    unconfirm(t.rows, email);
    const res = await b.send(await confirmationLink(email));
    expect(res.location).toBe('/c/raid?tab=events');
    expect((await b.send('/get-session')).json.user.email).toBe(email);
  });

  it('emails when a backup code is used to sign in, with how many are left', async () => {
    const { email } = await withTwoFactor(t);
    unconfirm(t.rows, email);
    const fresh = new Browser(t.auth);
    await fresh.send(await confirmationLink(email));
    const res = await fresh.send('/two-factor/verify-backup-code', {
      body: { code: await backupCode(t.auth, t.rows) },
    });
    expect(res.status).toBe(200);
    expect(t.events.at(-1)).toEqual({ event: 'backup-code-used', left: 9 });
  });

  describe('accounts without a password', () => {
    async function passwordless(signedInMinutesAgo: number) {
      const ctx = await t.auth.$context;
      // As if made by signing in with Discord: no credential account, so no password.
      const user = await ctx.internalAdapter.createUser(
        {
          email: `d${Math.random().toString(36).slice(2)}@example.test`,
          name: 'Dee',
          emailVerified: true,
        },
        { method: 'admin' },
      );
      const session = await ctx.internalAdapter.createSession(user.id);
      const at = new Date(Date.now() - signedInMinutesAgo * 60_000);
      Object.assign(
        t.rows.session!.find((s) => s.token === session.token)!,
        { createdAt: at },
      );
      const b = new Browser(t.auth);
      // Signed in as them (the session cookie is signed with the secret).
      const signed = await signCookie(session.token);
      b.cookies.set('better-auth.session_token', signed);
      return b;
    }

    it('need a recent sign-in to turn two-factor on', async () => {
      const stale = await passwordless(20);
      const refused = await stale.send('/two-factor/enable', { body: {} });
      expect(refused.status).toBe(403);
      expect(refused.json.code).toBe('SIGN_IN_AGAIN');

      const recent = await passwordless(1);
      const ok = await recent.send('/two-factor/enable', { body: {} });
      expect(ok.status).toBe(200);
      expect(ok.json.totpURI).toMatch(/^otpauth:\/\/totp\//);
    });

    it('need a code to turn it off or make new backup codes', async () => {
      const b = await passwordless(1);
      await b.send('/two-factor/enable', { body: {} });
      await b.send('/two-factor/verify-totp', {
        body: { code: await currentCode(t.auth, t.rows) },
      });

      for (const body of [{}, { code: '000000' }, { code: 'nope-nope' }]) {
        const refused = await b.send('/two-factor/disable', { body });
        expect(refused.status).toBe(400);
        expect(refused.json.code).toBe('INVALID_CODE');
      }
      const codes = await b.send('/two-factor/generate-backup-codes', {
        body: { code: await backupCode(t.auth, t.rows) },
      });
      expect(codes.status).toBe(200);
      expect(codes.json.backupCodes).toHaveLength(10);

      const off = await b.send('/two-factor/disable', {
        body: { code: await currentCode(t.auth, t.rows) },
      });
      expect(off.status).toBe(200);
      expect(t.events.map((e) => e.event)).toEqual(['on', 'off']);
    });
  });

  it('still asks accounts with a password for it', async () => {
    const { b } = await withTwoFactor(t);
    const refused = await b.send('/two-factor/disable', {
      body: { code: await currentCode(t.auth, t.rows) },
    });
    expect(refused.status).toBe(400);
    const off = await b.send('/two-factor/disable', { body: { password: PASSWORD } });
    expect(off.status).toBe(200);
  });
});

describe('codePageFor', () => {
  it('comes back to the page the sign-in was headed for, on this site only', () => {
    expect(codePageFor('/c/raid', BASE)).toBe(`${BASE}/sign-in/two-factor?next=%2Fc%2Fraid`);
    expect(codePageFor(`${BASE}/desktop/sign-in?challenge=abc`, BASE)).toBe(
      `${BASE}/sign-in/two-factor?next=${encodeURIComponent('/desktop/sign-in?challenge=abc')}`,
    );
    expect(codePageFor('https://evil.example/x', BASE)).toBe(`${BASE}/sign-in/two-factor?next=%2F`);
  });
});

async function signCookie(value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeURIComponent(`${value}.${Buffer.from(sig).toString('base64')}`);
}
