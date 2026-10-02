import { expect, test } from '@playwright/test';
import { createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

test('the mute list only names what you can still see', async ({ page, browser }) => {
  await signUp(page, uniqueUser('host'), '/new');
  const { name, slug } = await createCommunity(page, { private: true });
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite people' });
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  const link = await dialog.getByLabel('Invite link').inputValue();

  const context = await browser.newContext();
  const member = await context.newPage();
  await signUp(member, uniqueUser('muter'));
  await member.goto(link);
  await member.getByRole('button', { name: 'Accept invite' }).click();
  await member.waitForURL(new RegExp(`/c/${slug}$`));

  await member.getByRole('button', { name: `Mute notifications from ${name}` }).click();
  await member.getByRole('menuitem', { name: 'Until I unmute' }).click();
  await expect(member.getByText(`${name} muted.`)).toBeVisible();

  await member.goto('/settings/notifications');
  const muted = member.getByRole('region', { name: 'Muted' });
  await expect(muted.getByText(name)).toBeVisible();
  await expectAccessible(member, 'notification settings with mutes');

  // Once they've left a private community, its name isn't theirs to see any more.
  await member.goto(`/c/${slug}`);
  await member.getByRole('button', { name: /Joined/ }).click();
  await member.getByRole('menuitem', { name: 'Leave community' }).click();
  await expect(member.getByText('You left the community.')).toBeVisible();
  await member.goto('/settings/notifications');
  await expect(muted.getByText('Nothing is muted.')).toBeVisible();
  await expect(muted.getByText(name)).toHaveCount(0);
  await context.close();
});
