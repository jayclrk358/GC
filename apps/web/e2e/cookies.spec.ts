import { expect, test } from '@playwright/test';
import { expectAccessible } from './helpers';

// A first visit, with no answer to the cookie question yet.
test.use({ storageState: { cookies: [], origins: [] } });

test('first visits ask about cookies, and the answer sticks', async ({ page, context }) => {
  const cookie = async (name: string) =>
    (await context.cookies()).find((c) => c.name === name)?.value;

  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Cookies' });
  await expect(banner).toBeVisible();
  await expectAccessible(page, 'cookie banner');
  // Nothing optional until it's allowed.
  expect(await cookie('mx-tz')).toBeUndefined();

  await banner.getByRole('button', { name: 'Necessary only' }).click();
  await expect(banner).toBeHidden();
  expect(await cookie('mx-cookies')).toBe('1.necessary');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cookies' })).toHaveCount(0);
  expect(await cookie('mx-tz')).toBeUndefined();

  // Changing your mind, from the footer: the choice comes back, with focus on it.
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('heading', { name: 'Cookies' })).toBeFocused();
  await expect(banner.getByText("You've allowed necessary cookies only.")).toBeVisible();
  await banner.getByRole('button', { name: 'Accept all' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByText('Cookie choice saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cookie settings' })).toBeFocused();
  expect(await cookie('mx-cookies')).toBe('1.all');
  expect(await cookie('mx-tz')).toBeTruthy();

  // The privacy policy explains them, and can change the choice too.
  await page.goto('/legal/privacy#cookies');
  const section = page.locator('#cookies');
  await expect(section.getByText('mx-tz')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Cookie settings' })).toBeVisible();
  await expectAccessible(page, 'privacy policy');
});
