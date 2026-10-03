import { createHash, randomBytes } from 'node:crypto';
import { expect, request, test, type Page } from '@playwright/test';
import { expectAccessible, grantAdmin, PASSWORD, signIn, signUp, uniqueUser } from './helpers';

// Signing in to the Windows app through the browser: the browser's half (the page and the one-time
// code) and the app's half (trading the code and its secret for a session), and that a code is
// no use to anyone else.

const BASE = 'http://localhost:3000';

function secretPair() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Press "Continue in the app" and catch the one-time code the page hands to the app. */
async function continueInApp(page: Page, name: string): Promise<string> {
  const handoff = page.waitForResponse('**/api/auth/desktop/handoff');
  await page.getByRole('button', { name: `Continue in the app as ${name}` }).click();
  const res = await handoff;
  expect(res.ok()).toBe(true);
  const { code } = (await res.json()) as { code: string };
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return code;
}

/** The app's side: its own cookie jar (with a cookie already, like the app's), and its origin. */
async function redeem(code: string, verifier: string, headers: Record<string, string> = {}) {
  const app = await request.newContext({ baseURL: BASE });
  const res = await app.post('/api/auth/desktop/redeem', {
    data: { code, verifier },
    headers: { origin: BASE, cookie: 'mx-cookies=1.necessary', ...headers },
  });
  const session = res.ok()
    ? ((await (await app.get('/api/auth/get-session')).json()) as {
        user?: { email: string };
      } | null)
    : null;
  await app.dispose();
  return { status: res.status(), email: session?.user?.email ?? null };
}

test('desktop sign-in: the browser hands the app a session of its own', async ({ page }) => {
  const user = await signUp(page, uniqueUser('desk'));
  const { verifier, challenge } = secretPair();

  await page.goto(`/desktop/sign-in?challenge=${challenge}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in to Game Central for Windows' }),
  ).toBeVisible();
  await expect(page.getByText(`You’re signed in as ${user.name}.`)).toBeVisible();
  await expectAccessible(page, 'desktop sign-in');
  const code = await continueInApp(page, user.name);
  await expect(page.getByText('Opening Game Central')).toBeVisible();
  await expectAccessible(page, 'desktop sign-in opened');

  // The app trades it for a session of its own.
  expect(await redeem(code, verifier)).toEqual({ status: 200, email: user.email });
  // Once.
  expect((await redeem(code, verifier)).status).toBe(400);
});

test('desktop sign-in: codes are no use without the app’s secret', async ({ page }) => {
  const user = await signUp(page, uniqueUser('deskx'));
  const { verifier, challenge } = secretPair();
  await page.goto(`/desktop/sign-in?challenge=${challenge}`);

  // The wrong secret uses the code up.
  let code = await continueInApp(page, user.name);
  expect((await redeem(code, secretPair().verifier)).status).toBe(400);
  expect((await redeem(code, verifier)).status).toBe(400);

  // Another website can't trade one in (to sign someone's browser in to the wrong account). In a
  // new tab: the first one is left with the browser's "open Game Central?" prompt.
  const tab = await page.context().newPage();
  await tab.goto(`/desktop/sign-in?challenge=${challenge}`);
  code = await continueInApp(tab, user.name);
  expect((await redeem(code, verifier, { origin: 'https://evil.example' })).status).toBe(403);
  expect((await redeem(code, verifier, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);

  // Made-up codes, and codes for nobody signed in.
  expect((await redeem(randomBytes(32).toString('base64url'), verifier)).status).toBe(400);
  const anon = await request.newContext({ baseURL: BASE });
  expect((await anon.post('/api/auth/desktop/handoff', { data: { challenge } })).status()).toBe(
    401,
  );
  expect(
    (await anon.post('/api/auth/desktop/redeem', { data: { code: 'x', verifier: 'y' } })).status(),
  ).toBe(400);
  await anon.dispose();

  // Another website can't ask for a code with someone's cookies.
  const forged = await page.request.post('/api/auth/desktop/handoff', {
    data: { challenge },
    headers: { origin: 'https://evil.example' },
  });
  expect(forged.ok()).toBe(false);
});

test('desktop sign-in: a code dies with the session it came from', async ({ page }) => {
  const user = await signUp(page, uniqueUser('deskout'));
  const { verifier, challenge } = secretPair();
  await page.goto(`/desktop/sign-in?challenge=${challenge}`);
  const code = await continueInApp(page, user.name);
  // Signed out in the browser before the app got there.
  const out = await page.request.post('/api/auth/sign-out', {
    data: {},
    headers: { origin: BASE },
  });
  expect(out.ok()).toBe(true);
  expect((await redeem(code, verifier)).status).toBe(400);
});

test('desktop sign-in: staff looking at an account as its owner can’t hand it on', async ({
  page,
  browser,
}) => {
  const target = uniqueUser('desktgt');
  const targetContext = await browser.newContext();
  const targetPage = await targetContext.newPage();
  await signUp(targetPage, target);
  const { user: targetUser } = (await (
    await targetPage.request.get('/api/auth/get-session')
  ).json()) as { user: { id: string } };
  await targetContext.close();

  const staff = await signUp(page, uniqueUser('deskstaff'));
  grantAdmin(staff.email);
  // A new session, which carries the new role.
  await page.context().clearCookies();
  await signIn(page, staff.email);
  const as = await page.request.post('/api/auth/admin/impersonate-user', {
    data: { userId: targetUser.id },
    headers: { origin: BASE },
  });
  expect(as.ok()).toBe(true);
  const { challenge } = secretPair();
  const res = await page.request.post('/api/auth/desktop/handoff', {
    data: { challenge },
    headers: { origin: BASE },
  });
  expect(res.status()).toBe(403);
});

test('desktop sign-in: back from the provider, it carries on by itself', async ({ page }) => {
  const user = await signUp(page, uniqueUser('deska'));
  const { verifier, challenge } = secretPair();
  // What the page notes before sending someone off to Discord or Google.
  await page.goto('/explore');
  await page.evaluate((c) => sessionStorage.setItem('gc-desktop-sign-in', c), challenge);
  const handoff = page.waitForResponse('**/api/auth/desktop/handoff');
  await page.goto(`/desktop/sign-in?challenge=${challenge}`);
  const { code } = (await (await handoff).json()) as { code: string };
  await expect(page.getByText('Opening Game Central')).toBeVisible();
  expect(await redeem(code, verifier)).toEqual({ status: 200, email: user.email });

  // Sent here by a link instead, nothing happens until they press the button.
  const tab = await page.context().newPage();
  await tab.goto(`/desktop/sign-in?challenge=${challenge}`);
  await expect(
    tab.getByRole('button', { name: `Continue in the app as ${user.name}` }),
  ).toBeEnabled();
  await expect(tab.getByText('Opening Game Central')).toBeHidden();
});

test('desktop sign-in: a brand-new account agrees to the terms on the way', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const someone = uniqueUser('desknew');
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: {
      name: someone.name,
      email: someone.email,
      password: PASSWORD,
      username: someone.username,
    },
  });
  expect(res.ok()).toBe(true);
  const { challenge } = secretPair();
  await page.goto(`/desktop/sign-in?challenge=${challenge}`);
  await expect(page).toHaveURL(/\/accept-terms\?next=/);
  await page.getByRole('checkbox', { name: /agree to the Terms of Service/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  // The link back to the app survives.
  await expect(page).toHaveURL(new RegExp(`/desktop/sign-in\\?challenge=${challenge}$`));
  await expect(
    page.getByRole('button', { name: `Continue in the app as ${someone.name}` }),
  ).toBeVisible();
  await context.close();
});

test('what’s new: the changelog page and the feed the Windows app reads', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Footer' })
    .getByRole('link', { name: 'What’s new' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'What’s new' })).toBeVisible();
  await expect(page.getByText('Latest', { exact: true })).toBeVisible();
  await expectAccessible(page, 'changelog');

  const res = await page.request.get('/api/changelog');
  expect(res.ok()).toBe(true);
  const { entries } = (await res.json()) as {
    entries: { id: string; date: string; title: string; items: string[] }[];
  };
  const latest = entries[0];
  if (!latest) throw new Error('The changelog is empty');
  expect(latest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('heading', { level: 2, name: latest.title })).toBeVisible();
});
