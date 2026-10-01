import { expect, test, type Page } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  joinAsMember,
  PASSWORD,
  signUp,
  uniqueUser,
} from './helpers';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message #lounge' });

test('terms: sign-up needs agreement, and people who haven’t agreed are asked first', async ({
  page,
  browser,
}) => {
  const user = uniqueUser('terms');
  await page.goto('/sign-up');
  await page.getByLabel('Display name').fill(user.name);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Tick the box to agree to the terms.')).toBeVisible();

  // The terms and privacy pages are linked from the form and the footer.
  const footer = page.getByRole('navigation', { name: 'Footer' });
  await footer.getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await expectAccessible(page, 'terms');
  await footer.getByRole('link', { name: 'Privacy' }).click();
  await page.waitForURL(/\/legal\/privacy$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible({
    timeout: 30_000,
  });
  await expectAccessible(page, 'privacy policy');

  // Someone who signed up without the form (e.g. with Discord) is asked before anything else.
  const context = await browser.newContext();
  const other = await context.newPage();
  const someone = uniqueUser('oauthish');
  const res = await other.request.post('/api/auth/sign-up/email', {
    data: {
      name: someone.name,
      email: someone.email,
      password: PASSWORD,
      username: someone.username,
    },
  });
  expect(res.ok()).toBe(true);
  await other.goto('/explore');
  await expect(other).toHaveURL(/\/accept-terms\?next=%2Fexplore/);
  await expect(other.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await expectAccessible(other, 'accept terms');
  await other.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(other.getByText('Tick the box to agree first.')).toBeVisible();
  await other.getByRole('checkbox', { name: /agree to the Terms of Service/ }).check();
  await other.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(other).toHaveURL(/\/explore$/);
  await context.close();
});

test('18+ communities ask visitors to confirm they’re adults', async ({ page, browser }) => {
  await signUp(page, uniqueUser('adult'), '/new');
  const { slug, name } = await createCommunity(page);
  await page.goto(`/c/${slug}/settings`);
  await page.getByRole('switch', { name: 'Mature content (18+)' }).click();
  await page.getByRole('button', { name: 'Save changes' }).first().click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  // A visitor who isn't signed in.
  const guest = await browser.newContext();
  const visitor = await guest.newPage();
  await visitor.goto(`/c/${slug}`);
  await expect(visitor.getByRole('heading', { name: `${name} is for adults` })).toBeVisible();
  await expectAccessible(visitor, 'adult gate');
  await visitor.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(visitor.getByRole('heading', { level: 1, name })).toBeVisible();
  // Remembered.
  await visitor.goto(`/c/${slug}`);
  await expect(visitor.getByRole('heading', { level: 1, name })).toBeVisible();
  await guest.close();
});

test('download your data, then delete your account', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const owner = uniqueUser('keeper');
  await signUp(page, owner, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  const member = await joinAsMember(browser, slug, 'leaver');
  await member.page.goto(`/c/${slug}/chat/lounge`);
  await composer(member.page).fill('goodbye for now');
  await composer(member.page).press('Enter');
  const said = page.locator('article[data-message-id]').filter({ hasText: 'goodbye for now' });

  // Their data, as a file.
  await member.page.goto('/settings/account');
  await expectAccessible(member.page, 'account settings');
  const download = member.page.waitForEvent('download');
  await member.page.getByRole('link', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^magnox-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(
    await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()),
  );
  expect(data.account.email).toBe(member.user.email);
  expect(data.messages[0].content).toBe('goodbye for now');
  expect(data.communities.memberOf).toHaveLength(1);

  // The owner can't leave without handing over their community.
  await page.goto('/settings/account');
  await expect(page.getByText('You own these communities.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete my account' })).toHaveCount(0);

  // The member can: and takes their messages with them.
  await member.page.getByRole('checkbox', { name: /Also remove my chat messages/ }).check();
  const del = member.page.getByRole('button', { name: 'Delete my account' });
  await expect(del).toBeDisabled();
  await member.page
    .getByRole('textbox', { name: `Type ${member.user.username} to confirm` })
    .fill(member.user.username);
  await del.click();
  await member.page.waitForURL(/accountDeleted=1/);
  await expect(member.page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();

  // They can't sign back in, their message is gone, and the community has one member again.
  await member.page.goto('/sign-in');
  await member.page.getByLabel('Email or username').fill(member.user.email);
  await member.page.getByLabel('Password').fill(PASSWORD);
  await member.page.getByRole('button', { name: 'Sign in' }).click();
  await expect(member.page.getByRole('alert')).toBeVisible();
  await page.goto(`/c/${slug}/chat/lounge`);
  await expect(composer(page)).toBeVisible();
  await expect(said).toHaveCount(0);
  await member.context.close();
});
