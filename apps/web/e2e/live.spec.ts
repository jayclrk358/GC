import { expect, test, type Page } from '@playwright/test';
import {
  choose,
  createCommunity,
  joinAsMember,
  post,
  reply,
  signUp,
  startThread,
  uniqueUser,
} from './helpers';

/**
 * Tag the loaded document, so a full page reload would be noticed. Also gives the socket time to
 * subscribe before the other side changes anything.
 */
async function markDocument(page: Page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
}

async function expectSameDocument(page: Page) {
  const same = await page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument,
  );
  expect(same, 'the page should update in place, not reload').toBe(true);
}

test.describe('live updates', () => {
  test('new threads, replies and wiki pages appear without reloading', async ({
    page,
    browser,
  }) => {
    await signUp(page, uniqueUser('live'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const member = await joinAsMember(browser, slug);

    await member.page.goto(`/c/${slug}/forum/general`);
    await markDocument(member.page);
    const threadUrl = await startThread(page, slug, 'general', 'Live thread', 'First post.');
    await expect(member.page.getByRole('link', { name: 'Live thread' })).toBeVisible();
    // Screen readers hear about it too.
    await expect(
      member.page.getByRole('status').filter({ hasText: '1 new thread' }),
    ).toBeAttached();
    await expectSameDocument(member.page);

    await member.page.goto(threadUrl);
    await markDocument(member.page);
    await reply(page, 'A reply that arrives live');
    await expect(post(member.page, 'A reply that arrives live')).toBeVisible();
    await expect(member.page.getByRole('status').filter({ hasText: '1 new reply' })).toBeAttached();
    await expectSameDocument(member.page);

    await member.page.goto(`/c/${slug}/wiki`);
    await member.page.waitForURL(/\/wiki\/home$/);
    await markDocument(member.page);
    await page.goto(`/c/${slug}/wiki/new`);
    await page.getByLabel('Title').fill('Server rules');
    await page.getByRole('textbox', { name: 'Content' }).fill('Be kind to other players.');
    await page.getByRole('button', { name: 'Create page' }).click();
    await page.waitForURL(/\/wiki\/server-rules$/);
    await expect(
      member.page.getByRole('navigation', { name: 'Pages' }).getByRole('link', {
        name: 'Server rules',
      }),
    ).toBeVisible();
    await expectSameDocument(member.page);
    await member.context.close();
  });

  test('readers who ask to be told first get a banner instead', async ({ page, browser }) => {
    await signUp(page, uniqueUser('live'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const threadUrl = await startThread(page, slug, 'general', 'Quiet thread', 'First post.');
    const member = await joinAsMember(browser, slug);

    await member.page.goto('/settings/accessibility');
    await choose(
      member.page.getByLabel('New posts and updates'),
      'Tell me, and wait until I load them',
    );
    await expect(
      member.page.getByRole('status').filter({ hasText: 'Preferences saved' }),
    ).toBeAttached();

    await member.page.goto(threadUrl);
    await markDocument(member.page);
    await reply(page, 'This reply waits behind a banner');
    const banner = member.page.getByRole('status').filter({ hasText: '1 new reply' });
    await expect(banner).toBeVisible();
    await expect(post(member.page, 'This reply waits behind a banner')).toHaveCount(0);
    await banner.getByRole('button', { name: 'Show' }).click();
    await expect(post(member.page, 'This reply waits behind a banner')).toBeVisible();
    await member.context.close();
  });
});
