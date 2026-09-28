import { expect, test, type Page } from '@playwright/test';
import { createCommunity, expectAccessible, signUp, startThread, uniqueUser } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** Nothing on the page is wider than the screen (no sideways scrolling). */
async function expectNoSidewaysScroll(page: Page, label: string) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${label} is wider than the screen`).toBeLessThanOrEqual(390);
}

test('pages fit a phone screen', async ({ page }) => {
  const user = await signUp(page, uniqueUser('phone'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });
  const thread = await startThread(page, slug, 'support', 'Phone thread', 'Small screens');

  // The community header keeps its counts readable: each on one line, under the name.
  await page.goto(`/c/${slug}`);
  const details = page.getByRole('list', { name: 'Community details' });
  for (const item of [/1 member/, /1 online/]) {
    const box = (await details.getByRole('listitem').filter({ hasText: item }).boundingBox())!;
    expect(box.height, `${item} wraps`).toBeLessThan(30);
  }
  const name = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const counts = (await details.boundingBox())!;
  expect(counts.y).toBeGreaterThan(name.y);
  await expectAccessible(page, 'community on a phone');

  for (const url of [
    `/c/${slug}`,
    `/c/${slug}/members`,
    `/c/${slug}/forum/support`,
    thread,
    `/c/${slug}/chat/lounge`,
    `/c/${slug}/wiki`,
    `/c/${slug}/settings`,
    `/c/${slug}/settings/roles`,
    '/',
    '/explore',
    '/servers',
    `/u/${user.username}`,
    '/settings/accessibility',
    '/settings/profile',
  ]) {
    await page.goto(url);
    await expectNoSidewaysScroll(page, url);
  }

  // Chat fills the screen exactly: the community header stays in view, the composer isn't cut off.
  await page.goto(`/c/${slug}/chat/lounge`);
  await expect(page.getByRole('textbox', { name: 'Message #lounge' })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
  ).toBeLessThanOrEqual(1);

  // Settings tabs scroll sideways and keep the current one in view.
  await page.goto(`/c/${slug}/settings/roles`);
  const tabs = page.getByRole('navigation', { name: 'Community settings sections' });
  await expect(tabs.getByRole('link', { name: 'Roles & permissions' })).toBeInViewport();
});
