import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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

/** Run axe with WCAG 2.2 AA rules and fail on any violation. */
export async function expectAccessible(page: Page, label = page.url()) {
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
}
