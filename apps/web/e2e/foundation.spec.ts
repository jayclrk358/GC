import { expect, test } from '@playwright/test';
import { expectAccessible, setScheme, signIn, signUp, uniqueUser } from './helpers';

test.describe('foundation', () => {
  test('home page is accessible in every colour mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const [scheme, contrast] of [
      ['light', 'normal'],
      ['dark', 'normal'],
      ['light', 'high'],
      ['dark', 'high'],
    ] as const) {
      await setScheme(page, scheme, contrast);
      await expectAccessible(page, `home ${scheme}/${contrast}`);
    }
  });

  test('skip link moves focus to main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('sign up, sign out and sign in again', async ({ page }) => {
    const user = await signUp(page, uniqueUser());
    await page.getByRole('button', { name: `Account menu for ${user.name}` }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await signIn(page, user.username);
  });

  test('auth pages are accessible', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password']) {
      await page.goto(path);
      await expectAccessible(page, path);
    }
  });

  test('accessibility preferences apply immediately and persist', async ({ page }) => {
    await page.goto('/settings/accessibility');
    await expectAccessible(page, 'accessibility settings');
    await page.getByRole('switch', { name: 'High contrast' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await page.getByLabel('Font', { exact: true }).selectOption('atkinson');
    await expect(page.locator('html')).toHaveAttribute('data-font', 'atkinson');
    await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeAttached();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(page.locator('html')).toHaveAttribute('data-font', 'atkinson');
    await expectAccessible(page, 'accessibility settings (high contrast)');
  });

  test('command palette opens from the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await page.keyboard.type('explore');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/explore$/);
  });

  test('shortcut help lists shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });
});
