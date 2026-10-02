import { expect, test } from '@playwright/test';
import { createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

test('avatars show who is online, idle or offline', async ({ page, browser }) => {
  await signUp(page, uniqueUser('watcher'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // The member's browser runs on a controllable clock so their idle timer can be skipped ahead.
  const user = uniqueUser('presence');
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.clock.install();
  await signUp(other, user, `/c/${slug}`);
  await other.goto(`/c/${slug}`);
  await other.getByRole('button', { name: 'Join community' }).first().click();
  await expect(other.getByRole('button', { name: /Joined/ })).toBeVisible();

  await page.goto(`/c/${slug}/members`);
  const row = page.getByRole('listitem').filter({ hasText: user.name });
  await expect(row.getByRole('img', { name: 'Online' })).toBeVisible();

  // Their tab is hidden for a while (five minutes): idle.
  const setVisibility = (state: 'hidden' | 'visible') =>
    other.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await other.clock.fastForward(5 * 60_000 + 1_000);
  await expect(row.getByRole('img', { name: 'Idle' })).toBeVisible();

  // Back on the page: online again.
  await setVisibility('visible');
  await expect(row.getByRole('img', { name: 'Online' })).toBeVisible();
  await expectAccessible(page, 'member list with presence');

  // Gone: offline.
  await context.close();
  await expect(row.getByRole('img', { name: 'Offline' })).toBeVisible();
});
