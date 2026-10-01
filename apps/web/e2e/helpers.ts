import AxeBuilder from '@axe-core/playwright';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery-staple';

export function uniqueUser(prefix = 'tester') {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    name: `${prefix} ${id}`,
    username: `${prefix}_${id}`.slice(0, 24),
    email: `${prefix}.${id}@example.test`,
    password: PASSWORD,
  };
}

export async function signUp(page: Page, user = uniqueUser(), next = '/') {
  await page.goto(`/sign-up?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Display name').fill(user.name);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('checkbox', { name: /agree to the Terms of Service/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: `Account menu for ${user.name}` })).toBeVisible();
  return user;
}

export async function signIn(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email or username').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /Account menu for/ })).toBeVisible();
}

/**
 * Wait for entrance animations and colour transitions to finish, so contrast is measured on the
 * final colours. Looping decoration (the "live" ping) and scroll-linked motion never settle, so
 * they're left out.
 */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== 'running' ||
          a.effect?.getComputedTiming().iterations === Infinity ||
          a.timeline !== document.timeline,
      ),
  );
}

/** Run axe with WCAG 2.2 AA rules and fail on any violation. */
export async function expectAccessible(page: Page, label = page.url()) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join('\n    ')}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

export async function setScheme(
  page: Page,
  scheme: 'light' | 'dark',
  contrast: 'normal' | 'high' = 'normal',
) {
  await page.evaluate(
    ([s, c]) => {
      document.documentElement.setAttribute('data-scheme', s!);
      document.documentElement.setAttribute('data-contrast', c!);
    },
    [scheme, contrast],
  );
  await settle(page);
}

export interface CommunityOpts {
  name?: string;
  template?: 'Game server' | 'Clan or guild' | 'Fan hub' | 'Creator community';
  preset?: string;
  inviteOnly?: boolean;
  /** People apply and the team decides. */
  apply?: boolean;
}

/** Create a community through the wizard and return its slug. */
export async function createCommunity(page: Page, opts: CommunityOpts = {}) {
  const name = opts.name ?? `E2E ${Date.now().toString(36)}`;
  await page.goto('/new');
  await page.getByLabel('Community name').fill(name);
  await expect(page.getByText('This address is available.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  if (opts.template) await page.getByRole('radio', { name: new RegExp(opts.template) }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  if (opts.preset) await page.getByRole('radio', { name: opts.preset }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  if (opts.inviteOnly) await page.getByRole('radio', { name: /Invite only/ }).click();
  if (opts.apply) await page.getByRole('radio', { name: /Apply to join/ }).click();
  await page.getByRole('button', { name: 'Create community' }).click();
  await page.waitForURL(/\/c\/[a-z0-9-]+\?created=1/);
  const slug = new URL(page.url()).pathname.split('/')[2]!;
  return { name, slug };
}

export const FIXTURE_CTL = 'http://127.0.0.1:25591';

/** A second person who joins the community in their own browser context. */
export async function joinAsMember(browser: Browser, slug: string, prefix = 'member') {
  const user = uniqueUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, user, `/c/${slug}`);
  await page.goto(`/c/${slug}`);
  await page.getByRole('button', { name: 'Join community' }).first().click();
  await expect(page.getByRole('button', { name: /Joined/ })).toBeVisible();
  return { user, page, context };
}

export async function startThread(
  page: Page,
  slug: string,
  channel: string,
  title: string,
  body: string,
) {
  await page.goto(`/c/${slug}/forum/${channel}/new`);
  await page.getByLabel('Title').fill(title);
  await page.getByRole('textbox', { name: 'Message' }).fill(body);
  await page.getByRole('button', { name: 'Post thread' }).click();
  await page.waitForURL(/\/t\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
  return page.url();
}

/** One post in a thread (the thread itself is also an article, so match post ids). */
export function post(page: Page, text: string) {
  return page.locator('article[id^="post-"]').filter({ hasText: text });
}

export async function reply(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Your reply' }).fill(text);
  await page.getByRole('button', { name: 'Post reply' }).click();
  await expect(post(page, text)).toBeVisible();
}

/** Pick an option from one of our dropdowns (a button that opens a listbox, not a native select). */
export async function choose(dropdown: Locator, option: string | RegExp) {
  await dropdown.click();
  const listbox = dropdown.page().getByRole('listbox');
  await listbox.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
  await expect(listbox).toBeHidden();
}

/**
 * Put the signed-in owner's (only) community on a paid plan, through the store and the fixture
 * server's stand-in for Stripe Checkout.
 */
export async function upgradeCommunity(page: Page, slug: string, plan: 'Plus' | 'Pro' = 'Plus') {
  await page.goto('/store');
  const card = page.getByRole('region', { name: plan });
  await card.getByRole('button', { name: `Get ${plan}` }).click();
  await page
    .getByRole('dialog', { name: `Get ${plan}` })
    .getByRole('button', { name: 'Continue to checkout' })
    .click();
  await expect(page.getByRole('heading', { name: 'Fixture Checkout' })).toBeVisible();
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.waitForURL(new RegExp(`/c/${slug}/settings/billing`));
  await expect(page.getByText(`Thanks! ${plan} is now on.`)).toBeVisible();
}
