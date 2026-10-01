import { expect, test, type Page } from '@playwright/test';
import {
  choose,
  createCommunity,
  expectAccessible,
  joinAsMember,
  signUp,
  uniqueUser,
} from './helpers';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message #lounge' });
const message = (page: Page, text: string) =>
  page.locator('article[data-message-id]').filter({ hasText: text });

async function say(page: Page, text: string) {
  await composer(page).click();
  await composer(page).fill(text);
  await composer(page).press('Enter');
}

test('automod: blocked words, held links, the mod queue and raid protection', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = uniqueUser('automod');
  await signUp(page, owner, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // Blocked words are stopped; links anywhere but YouTube wait for a moderator.
  await page.goto(`/c/${slug}/settings/automod`);
  await expect(page.getByRole('heading', { level: 1, name: 'Automod' })).toBeVisible();
  await page.getByRole('switch', { name: 'Check for blocked words' }).click();
  await page.getByRole('textbox', { name: 'Words and phrases' }).fill('grief*\nfree nitro');
  await page.getByRole('switch', { name: 'Only allow links to these sites' }).click();
  await page.getByRole('textbox', { name: 'Sites that are fine' }).fill('youtube.com');
  await choose(
    page.getByRole('combobox', { name: 'When a post links anywhere else' }),
    'Hold it for a moderator to approve',
  );
  await page.getByRole('switch', { name: 'Pause joining during a rush' }).click();
  await page.getByRole('spinbutton', { name: 'Most joins in a minute' }).fill('2');
  await expectAccessible(page, 'automod settings');
  await page.getByRole('button', { name: 'Save automod' }).click();
  await expect(page.getByText('Automod saved')).toBeVisible();

  const member = await joinAsMember(browser, slug, 'chatter');
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await expect(composer(member.page)).toBeVisible();

  // A blocked word (written sneakily) never gets in.
  await say(member.page, 'stop GR1EFING us');
  await expect(
    message(member.page, 'stop GR1EFING us').getByText(
      /Your post wasn’t sent: it has a word this community doesn’t allow/,
    ),
  ).toBeVisible();

  // Allowed sites are fine; others are held back.
  await say(member.page, 'watch https://www.youtube.com/watch?v=abc');
  await expect(message(member.page, 'watch https://www.youtube.com')).toBeVisible();
  await say(member.page, 'my shop: cheap-gold.xyz');
  await expect(
    member.page.getByText('A moderator will look at your post before it appears'),
  ).toBeVisible();
  await expect(message(member.page, 'cheap-gold.xyz')).toHaveCount(0);

  // A forum thread with a link is held too.
  await member.page.goto(`/c/${slug}/forum/general/new`);
  await member.page.getByLabel('Title').fill('Selling stuff');
  await member.page.getByRole('textbox', { name: 'Message' }).fill('Go to deals.ru now');
  await member.page.getByRole('button', { name: 'Post thread' }).click();
  await expect(member.page.getByText('Waiting for a moderator')).toBeVisible();

  // Moderators see both in the mod queue.
  await page.goto(`/c/${slug}/settings/mod-queue`);
  await expect(page.getByRole('link', { name: /Mod queue\s*2/ })).toBeVisible();
  const items = page.getByRole('article');
  await expect(items).toHaveCount(2);
  await expectAccessible(page, 'mod queue');
  const chatItem = items.filter({ hasText: 'cheap-gold.xyz' });
  await expect(chatItem.getByText('Link: cheap-gold.xyz')).toBeVisible();
  await chatItem.getByRole('button', { name: /^Approve post by/ }).click();
  await expect(page.getByText(/^Posted .*’s post$/)).toBeVisible();
  const threadItem = page.getByRole('article').filter({ hasText: 'Selling stuff' });
  await threadItem.getByRole('button', { name: /^Reject post by/ }).click();
  await expect(page.getByText(/^Rejected .*’s post$/)).toBeVisible();
  await expect(page.getByText('Nothing waiting. All clear.')).toBeVisible();
  await page.getByRole('link', { name: 'Approved' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'cheap-gold.xyz' })).toBeVisible();

  // The approved message is in the channel now, from its author.
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await expect(message(member.page, 'my shop: cheap-gold.xyz')).toBeVisible();
  await member.context.close();

  // Raid protection: the member above was one join; two more in the same minute is a rush.
  const second = await joinAsMember(browser, slug, 'rush');
  await second.context.close();
  const third = await browser.newContext();
  const thirdPage = await third.newPage();
  await signUp(thirdPage, uniqueUser('late'), `/c/${slug}`);
  await thirdPage.goto(`/c/${slug}`);
  await thirdPage.getByRole('button', { name: 'Join community' }).first().click();
  await expect(thirdPage.getByText('New joins are paused for a few minutes')).toBeVisible();

  // The team can open the doors again.
  await page.goto(`/c/${slug}/settings/automod`);
  await expect(page.getByText(/^Joining is paused until/)).toBeVisible();
  await page.getByRole('button', { name: 'Let people join again' }).click();
  await expect(page.getByText('People can join again')).toBeVisible();
  await page.getByRole('switch', { name: 'Pause joining during a rush' }).click();
  await page.getByRole('button', { name: 'Save automod' }).click();
  await expect(page.getByText('Automod saved')).toBeVisible();
  await thirdPage.getByRole('button', { name: 'Join community' }).first().click();
  await expect(thirdPage.getByRole('button', { name: /Joined/ })).toBeVisible();
  await third.close();
});
