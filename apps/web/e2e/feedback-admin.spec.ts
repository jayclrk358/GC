import { expect, test, type Page } from '@playwright/test';
import {
  choose,
  createCommunity,
  expectAccessible,
  grantAdmin,
  signUp,
  uniqueUser,
} from './helpers';

const adminNav = (page: Page) => page.getByRole('navigation', { name: 'Admin' });

test('feedback: send it, the team replies and moves it along', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const memberUser = uniqueUser('fbuser');
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUp(member, memberUser, '/explore');

  // From the account menu, which remembers the page they were on.
  await member.goto('/explore');
  await member.getByRole('button', { name: /Account menu for/ }).click();
  await member.getByRole('menuitem', { name: 'Send feedback' }).click();
  await expect(member.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
  await expect(member.getByText('Nothing yet.')).toBeVisible();
  await expectAccessible(member, 'feedback page');
  await member.getByRole('radio', { name: /Something’s broken/ }).click();
  const title = `Search forgets my filters ${Date.now().toString(36)}`;
  await member.getByRole('textbox', { name: 'Title' }).fill(title);
  // Details are needed.
  await member.getByRole('button', { name: 'Send feedback' }).click();
  await expect(member.getByRole('textbox', { name: 'Details' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await member
    .getByRole('textbox', { name: 'Details' })
    .fill('I pick a game, go back, and the filter is gone.');
  await expect(member.getByRole('checkbox', { name: /Include the page I was on/ })).toBeChecked();
  await member.getByRole('button', { name: 'Send feedback' }).click();
  await expect(member.getByText('Thanks! Your feedback has been sent.')).toBeVisible();
  await expect(member.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(member.getByText('Waiting for the team to look at it.')).toBeVisible();
  await expect(member.getByRole('link', { name: '/explore' })).toBeVisible();
  await expectAccessible(member, 'feedback item');
  const feedbackUrl = member.url();

  // The team sees it in the console.
  const staffUser = uniqueUser('fbstaff');
  await signUp(page, staffUser, '/');
  grantAdmin(staffUser.email);
  await page.goto('/admin');
  await adminNav(page)
    .getByRole('link', { name: /^Feedback/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search feedback' }).fill(title);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expectAccessible(page, 'admin feedback');
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('/explore')).toBeVisible();
  await expectAccessible(page, 'admin feedback item');

  // A note for the team stays with the team.
  await page.getByRole('switch', { name: 'Team note only' }).click();
  await page.getByRole('textbox', { name: 'Team note' }).fill('Repro on Firefox too.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved.')).toBeVisible();
  // A reply reaches them.
  await page.getByRole('switch', { name: 'Team note only' }).click();
  await page.getByRole('textbox', { name: 'Your reply' }).fill('Thanks, we’re on it.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Reply sent.')).toBeVisible();
  await choose(page.getByRole('combobox', { name: 'Status' }), 'In progress');
  await expect(page.getByText('Marked In progress.')).toBeVisible();

  await member.goto(feedbackUrl);
  await expect(member.getByText('The team is working on it.')).toBeVisible();
  await expect(member.getByText('Thanks, we’re on it.')).toBeVisible();
  await expect(member.getByText('Repro on Firefox too.')).toBeHidden();
  // They can answer back.
  await member.getByRole('textbox', { name: 'Add something' }).fill('It happens on mobile too.');
  await member.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(member.getByText('It happens on mobile too.')).toBeVisible();
  // And they were told.
  await member.goto('/notifications');
  await expect(member.getByText(`The Game Central team replied: ${title}`)).toBeVisible();
  await expect(member.getByText(`Your feedback is now in progress: ${title}`)).toBeVisible();
  await memberContext.close();
});

test('admin menu: give staff access, change an account and remove a message', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // Someone posts something that breaks the rules.
  const posterUser = uniqueUser('poster');
  const posterContext = await browser.newContext();
  const poster = await posterContext.newPage();
  await signUp(poster, posterUser, '/new');
  const { slug } = await createCommunity(poster, { template: 'Game server' });
  await poster.goto(`/c/${slug}/chat/lounge`);
  const word = `spamword${Date.now().toString(36)}`;
  await poster.getByRole('textbox', { name: 'Message #lounge' }).fill(`buy gold ${word}`);
  await poster.keyboard.press('Enter');
  const sent = poster.locator('article[data-message-id]').filter({ hasText: word });
  await expect(sent).toBeVisible();
  await expect(sent.getByText('Sending…')).toBeHidden();

  const adminUser = uniqueUser('boss');
  await signUp(page, adminUser, '/');
  grantAdmin(adminUser.email);

  // Find it and take it down.
  await page.goto('/admin');
  await adminNav(page).getByRole('link', { name: 'Posts and messages' }).click();
  await page.getByRole('searchbox', { name: 'Words' }).fill(word);
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText(`buy gold ${word}`)).toBeVisible();
  await expectAccessible(page, 'admin content');
  await page.getByRole('button', { name: `Remove what ${posterUser.name} wrote` }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove this?' });
  await dialog.getByRole('textbox', { name: 'Why (for the record)' }).fill('Gold selling spam.');
  await expectAccessible(page, 'remove dialog');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Removed.')).toBeVisible();
  await expect(page.getByText('Nothing matches.')).toBeVisible();
  // It's gone from the channel, live.
  await expect(sent).toBeHidden();

  // Fix their name.
  await adminNav(page).getByRole('link', { name: 'People' }).click();
  await page.getByRole('searchbox', { name: /Find someone/ }).fill(posterUser.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: posterUser.name }).click();
  const newName = `Renamed ${Date.now().toString(36)}`;
  await page.getByRole('textbox', { name: 'Display name' }).fill(newName);
  await page.getByRole('switch', { name: 'Clear their profile text' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: newName })).toBeVisible();
  await expectAccessible(page, 'admin person edit');
  await poster.goto('/');
  await expect(poster.getByRole('button', { name: `Account menu for ${newName}` })).toBeVisible();

  // Make them a moderator: they find the console, without the admin-only parts.
  await adminNav(page).getByRole('link', { name: 'Staff' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email or username' }).fill(posterUser.username);
  await choose(page.getByRole('combobox', { name: 'Role' }), 'Moderator');
  await page.getByRole('button', { name: 'Add to staff' }).click();
  await expect(page.getByText('Added to staff.')).toBeVisible();
  const team = page.getByRole('region', { name: 'The team' });
  await expect(team.getByText(newName)).toBeVisible();
  await expectAccessible(page, 'admin staff');

  await poster.goto('/');
  await poster.getByRole('button', { name: /Account menu for/ }).click();
  await poster.getByRole('menuitem', { name: 'Admin console' }).click();
  await expect(poster.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(adminNav(poster).getByText('Moderator')).toBeVisible();
  await expect(adminNav(poster).getByRole('link', { name: /^Feedback/ })).toBeVisible();
  await expect(adminNav(poster).getByRole('link', { name: 'Staff' })).toBeHidden();
  await expect(adminNav(poster).getByRole('link', { name: 'Log' })).toBeHidden();
  expect((await poster.goto('/admin/log'))?.status()).toBe(404);
  expect((await poster.goto('/admin/staff'))?.status()).toBe(404);
  // Their profile says so, as does the admin's.
  await poster.goto(`/u/${posterUser.username}`);
  await expect(poster.getByText('Game Central Moderator')).toBeVisible();
  await expectAccessible(poster, 'moderator profile');
  await poster.goto(`/u/${adminUser.username}`);
  await expect(poster.getByText('Game Central Admin')).toBeVisible();
  // A moderator can't change an admin's account.
  await poster.goto('/admin/users');
  await poster.getByRole('searchbox', { name: /Find someone/ }).fill(adminUser.email);
  await poster.getByRole('button', { name: 'Search', exact: true }).click();
  await poster.getByRole('link', { name: adminUser.name }).click();
  await expect(poster.getByText(/only someone above them can change their account/)).toBeVisible();
  await expect(poster.getByRole('button', { name: 'Save changes' })).toBeHidden();

  // Take the access away again.
  await page.getByRole('button', { name: `Remove ${newName} from staff` }).click();
  await expect(page.getByText(`${newName} is no longer staff.`)).toBeVisible();
  expect((await poster.goto('/admin'))?.status()).toBe(404);
  await poster.goto(`/u/${posterUser.username}`);
  await expect(poster.getByRole('heading', { level: 1, name: newName })).toBeVisible();
  await expect(poster.getByText('Game Central Moderator')).toBeHidden();

  // On the record.
  await adminNav(page).getByRole('link', { name: 'Log' }).click();
  for (const action of ['message.remove', 'user.edit', 'staff.grant', 'staff.revoke']) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await posterContext.close();
});
