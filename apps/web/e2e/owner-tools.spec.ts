import { expect, test, type Page } from '@playwright/test';
import { createCommunity, expectAccessible, joinAsMember, signUp, uniqueUser } from './helpers';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message #lounge' });

test('owner tools: analytics, archiving and handing over ownership', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const owner = uniqueUser('owner');
  await signUp(page, owner, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // Someone joins and says hello, so there's something to count.
  const member = await joinAsMember(browser, slug, 'heir');
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await composer(member.page).fill('hello there');
  await composer(member.page).press('Enter');
  await expect(
    member.page.locator('article[data-message-id]').filter({ hasText: 'hello there' }),
  ).toBeVisible();

  await page.goto(`/c/${slug}/settings/analytics`);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  const members = page.locator('main dl').getByText('Members', { exact: true }).locator('..');
  await expect(members).toContainText('2');
  await expect(page.getByRole('img', { name: /^1 in 30 days\. Busiest day/ })).toBeVisible();
  const chart = page.getByRole('figure', { name: 'Chat messages per day' });
  await chart.getByText('Show as a table').click();
  await expect(chart.getByRole('table')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Busiest channels' }).getByRole('link', { name: '#lounge' }),
  ).toBeVisible();
  await expectAccessible(page, 'analytics');

  // Archive: read-only, closed to new members.
  await page.goto(`/c/${slug}/settings/danger`);
  await expectAccessible(page, 'danger zone');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Archive community' }).click();
  await expect(page.getByText('Community archived')).toBeVisible();
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await expect(member.page.getByText('This community is archived', { exact: true })).toBeVisible();
  await expect(
    member.page.getByText('This community is archived, so the chat is read-only.'),
  ).toBeVisible();
  await expect(composer(member.page)).toHaveCount(0);
  const late = await browser.newContext();
  const latePage = await late.newPage();
  await signUp(latePage, uniqueUser('late'), `/c/${slug}`);
  await latePage.goto(`/c/${slug}`);
  await expect(latePage.getByText('Archived: not taking new members').first()).toBeVisible();
  await late.close();

  // Bring it back.
  await page.getByRole('button', { name: 'Bring it back' }).click();
  await expect(page.getByText('Community is open again')).toBeVisible();
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await expect(composer(member.page)).toBeVisible();

  // Hand it over: they get the owner's settings, the old owner loses them.
  await page.getByRole('textbox', { name: 'New owner’s username' }).fill(member.user.username);
  await page.getByRole('textbox', { name: `Type ${slug} to hand it over` }).fill(slug);
  await page.getByRole('button', { name: 'Hand over ownership' }).click();
  await page.waitForURL(new RegExp(`/c/${slug}$`));
  await member.page.goto(`/c/${slug}/settings/danger`);
  await expect(member.page.getByRole('button', { name: 'Archive community' })).toBeVisible();
  const gone = await page.goto(`/c/${slug}/settings/danger`);
  expect(gone?.status()).toBe(404);
  await member.context.close();
});
