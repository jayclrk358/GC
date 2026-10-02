import { expect, test } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  grantAdmin,
  PASSWORD,
  signUp,
  uniqueUser,
} from './helpers';

test('admin console: give a plan, suspend a community and ban someone', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // Someone runs a community.
  const ownerUser = uniqueUser('runner');
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, ownerUser, '/new');
  const { slug, name } = await createCommunity(owner);

  // Not an admin yet: the console isn't there.
  const adminUser = uniqueUser('staff');
  await signUp(page, adminUser, '/');
  expect((await page.goto('/admin'))?.status()).toBe(404);
  grantAdmin(adminUser.email);

  await page.goto('/');
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('menuitem', { name: 'Admin console' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expectAccessible(page, 'admin overview');

  // Give the community Pro for good.
  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'Communities' })
    .click();
  await page.getByRole('searchbox', { name: 'Find a community by name or address' }).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expectAccessible(page, 'admin community');
  await page.getByRole('button', { name: 'Give plan' }).click();
  await expect(page.getByText('Plan given')).toBeVisible();
  await expect(page.getByText('Has Pro from Magnox, for good.')).toBeVisible();

  await owner.goto(`/c/${slug}/settings/billing`);
  await expect(
    owner.getByText('Magnox has given this community the Pro plan, for good.'),
  ).toBeVisible();

  // Suspend it: its pages say so, and it's gone from Explore.
  await page.getByRole('textbox', { name: 'Reason' }).fill('Selling stolen accounts.');
  await page.getByRole('button', { name: 'Suspend community' }).click();
  await expect(page.getByText('Community suspended')).toBeVisible();
  await owner.goto(`/c/${slug}`);
  await expect(
    owner.getByRole('heading', { name: 'This community has been suspended' }),
  ).toBeVisible();
  await expectAccessible(owner, 'suspended page');
  await page.getByRole('button', { name: 'Lift suspension' }).click();
  await expect(page.getByText('Community is back online')).toBeVisible();
  await owner.goto(`/c/${slug}`);
  await expect(owner.getByRole('heading', { level: 1, name })).toBeVisible();

  // Ban the owner: signed out everywhere, and can't sign back in.
  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'People' })
    .click();
  await page.getByRole('searchbox', { name: /Find someone/ }).fill(ownerUser.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: ownerUser.name }).click();
  await expectAccessible(page, 'admin person');
  await page.getByRole('textbox', { name: 'Reason' }).fill('Scamming members.');
  await page.getByRole('button', { name: 'Ban', exact: true }).click();
  await expect(page.getByText('Banned for good')).toBeVisible();
  await owner.goto('/');
  await expect(owner.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await owner.goto('/sign-in');
  await owner.getByLabel('Email or username').fill(ownerUser.email);
  await owner.getByLabel('Password').fill(PASSWORD);
  await owner.getByRole('button', { name: 'Sign in' }).click();
  await expect(owner.getByText(/banned/i)).toBeVisible();
  await page.getByRole('button', { name: 'Lift ban' }).click();
  await expect(page.getByText('Ban lifted')).toBeVisible();

  // Everything is on the record.
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Log' }).click();
  for (const action of [
    'plan.gift',
    'community.suspend',
    'community.unsuspend',
    'user.ban',
    'user.unban',
  ]) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await expectAccessible(page, 'admin log');
  await ownerContext.close();
});
