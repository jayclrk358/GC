import { expect, test } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  grantAdmin,
  joinAsMember,
  post,
  signUp,
  startThread,
  uniqueUser,
} from './helpers';

test('hovering a name shows a slice of their profile', async ({ page, browser }) => {
  const owner = await signUp(page, uniqueUser('carded'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });
  // They're on Game Central's team, too.
  grantAdmin(owner.email);
  const url = await startThread(page, slug, 'support', 'Card test', 'Hover my name');

  const member = await joinAsMember(browser, slug, 'hoverer');
  await member.page.goto(url);
  const author = post(member.page, 'Hover my name').getByRole('link', { name: owner.name });
  await author.hover();
  await expect(member.page.getByText('Joined Game Central')).toBeVisible();
  await expect(member.page.getByText(`@${owner.username}`)).toBeVisible();
  await expect(member.page.getByRole('img', { name: 'Community owner' })).toBeVisible();
  await expect(member.page.getByText('Game Central Admin')).toBeVisible();
  await expect(member.page.getByText(/^In E2E .+ since$/)).toBeVisible();
  await expect(member.page.getByRole('link', { name: 'View full profile' })).toBeVisible();
  await expectAccessible(member.page, 'profile card');

  // Moving away closes it; keyboard focus opens it too.
  await member.page.mouse.move(0, 0);
  await expect(member.page.getByText('Joined Game Central')).toBeHidden();
  await author.focus();
  await expect(member.page.getByText('Joined Game Central')).toBeVisible();
  await member.page.keyboard.press('Escape');
  await expect(member.page.getByText('Joined Game Central')).toBeHidden();

  // Chat names have the card as well.
  await page.goto(`/c/${slug}/chat/lounge`);
  const composer = page.getByRole('textbox', { name: 'Message #lounge' });
  await composer.click();
  await composer.fill('Hello from the owner');
  await composer.press('Enter');
  await member.page.goto(`/c/${slug}/chat/lounge`);
  const msg = member.page
    .locator('article[data-message-id]')
    .filter({ hasText: 'Hello from the owner' });
  await msg.getByRole('link', { name: owner.name }).hover();
  await expect(member.page.getByText('Joined Game Central')).toBeVisible();
  await member.context.close();

  // On the profile page the avatar sits on top of the banner it overlaps.
  await page.goto(`/u/${owner.username}`);
  await expect(page.getByText('Game Central Admin')).toBeVisible();
  await expectAccessible(page, 'staff profile');
  const avatar = page.locator('[data-profile-avatar]');
  const box = (await avatar.boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => Boolean(document.elementFromPoint(x!, y!)?.closest('[data-profile-avatar]')),
    [box.x + box.width / 2, box.y + 12],
  );
  expect(onTop).toBe(true);
});
