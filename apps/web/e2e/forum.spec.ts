import { expect, test } from '@playwright/test';
import {
  choose,
  createCommunity,
  expectAccessible,
  joinAsMember,
  post,
  reply,
  setScheme,
  signUp,
  startThread,
  uniqueUser,
} from './helpers';

test.describe('forum', () => {
  test('thread with a poll, reactions, a reply and a live notification', async ({
    page,
    browser,
  }) => {
    const owner = await signUp(page, uniqueUser('owner'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });

    await page.goto(`/c/${slug}/forum`);
    await expect(page.getByRole('link', { name: 'general', exact: true })).toBeVisible();
    await expectAccessible(page, 'forum index');
    await page.getByRole('link', { name: 'general', exact: true }).click();
    await page.waitForURL(/\/forum\/general$/);
    await expect(page.getByRole('heading', { level: 2, name: 'general' })).toBeVisible();
    await expectAccessible(page, 'forum channel');

    await page.getByRole('link', { name: 'New thread' }).click();
    await page.getByLabel('Title').fill('Which biome should we build in?');
    await page
      .getByRole('textbox', { name: 'Message' })
      .fill('Let us pick the next community build site.');
    await page.getByRole('button', { name: 'Add a poll' }).click();
    await page.getByLabel('Question').fill('Pick a biome');
    await page.getByLabel('Option 1').fill('Desert');
    await page.getByLabel('Option 2').fill('Taiga');
    await expectAccessible(page, 'thread composer');
    await page.getByRole('button', { name: 'Post thread' }).click();
    await page.waitForURL(/\/t\/[0-9a-f-]{36}$/);
    const threadUrl = page.url();
    await expect(page.getByRole('heading', { level: 3, name: 'Pick a biome' })).toBeVisible();
    await expectAccessible(page, 'thread page');

    const member = await joinAsMember(browser, slug);
    await member.page.goto(threadUrl);
    await member.page.getByRole('radio', { name: 'Taiga' }).check();
    await member.page.getByRole('button', { name: 'Vote', exact: true }).click();
    await expect(member.page.getByText('(your vote)')).toBeVisible();

    const op = post(member.page, 'Let us pick the next community build site.');
    await op.getByRole('button', { name: 'Add reaction' }).click();
    await member.page.getByRole('button', { name: 'thumbs up' }).click();
    await expect(op.getByRole('button', { name: 'thumbs up: 1 reaction' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The owner follows their own thread, so a reply reaches them live.
    await page.goto('/notifications');
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
    await member.page.goto(threadUrl);
    await reply(member.page, 'Taiga has the best wood.');
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
    const name = new RegExp(`${member.user.name} replied in Which biome`);
    // The open notifications page picks it up too, without a reload.
    await expect(page.getByRole('main').getByRole('link', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
    const item = page.getByRole('dialog').getByRole('link', { name });
    await expect(item).toBeVisible();
    await expectAccessible(page, 'notification popover');
    await item.click();
    await page.waitForURL(/#post-/);
    await expect(page.getByText('Taiga has the best wood.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

    await page.goto('/notifications');
    await expect(page.getByRole('link', { name: /replied in Which biome/ })).toBeVisible();
    await expectAccessible(page, 'notifications page');
    await page.goto('/settings/notifications');
    await expectAccessible(page, 'notification settings');
    expect(owner.username).toBeTruthy();
    await member.context.close();
  });

  test('Q&A: mark the answer, edit with history, search and delete', async ({ page, browser }) => {
    const asker = await signUp(page, uniqueUser('asker'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const url = await startThread(
      page,
      slug,
      'support',
      'Villagers keep despawning',
      'They vanish every night. Why?',
    );

    const member = await joinAsMember(browser, slug, 'helper');
    await member.page.goto(url);
    // @mentions from the editor reach the server intact and link to the profile.
    const box = member.page.getByRole('textbox', { name: 'Your reply' });
    await box.click();
    await member.page.keyboard.type(`@${asker.username.slice(0, 10)}`);
    await member.page.getByRole('option', { name: new RegExp(asker.username) }).click();
    await member.page.keyboard.type('Name them with a name tag so they persist.');
    await member.page.getByRole('button', { name: 'Post reply' }).click();
    await expect(post(member.page, 'Name them with a name tag')).toBeVisible();
    await expect(
      post(member.page, 'Name them with a name tag').getByRole('link', {
        name: `@${asker.username}`,
      }),
    ).toBeVisible();
    await member.context.close();

    await page.reload();
    const answer = post(page, 'Name them with a name tag');
    await answer.getByRole('button', { name: 'Mark as answer' }).click();
    await expect(answer.getByText('Accepted answer')).toBeVisible();
    await expect(page.getByText('Solved', { exact: true })).toBeVisible();

    // Edit the opening post; the old version stays in its history.
    const op = post(page, 'They vanish');
    await op.getByRole('button', { name: /More actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit thread' });
    await edit
      .getByRole('textbox', { name: 'Message' })
      .fill('They vanish every night after the update. Why?');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('after the update')).toBeVisible();
    await expect(op.getByText('edited')).toBeVisible();
    await op.getByRole('button', { name: /More actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Edit history' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit history' })).toContainText(
      'They vanish every night. Why?',
    );
    await page.keyboard.press('Escape');

    await page.goto(`/c/${slug}/forum/search?q=villagers`);
    await expect(page.getByRole('link', { name: 'Villagers keep despawning' })).toBeVisible();
    await expectAccessible(page, 'forum search');

    await page.goto(`/c/${slug}/forum/support?sort=unanswered`);
    await expect(page.getByRole('link', { name: 'Villagers keep despawning' })).toBeHidden();

    await page.goto(url);
    await post(page, 'after the update')
      .getByRole('button', { name: /More actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Delete thread' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this thread?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.waitForURL(/\/forum\/support$/);
    await expect(page.getByRole('link', { name: 'Villagers keep despawning' })).toBeHidden();
  });

  test('wiki: create, edit, compare and restore', async ({ page }) => {
    await signUp(page, uniqueUser('wiki'), '/new');
    const { slug } = await createCommunity(page);
    await page.goto(`/c/${slug}/wiki`);
    await page.waitForURL(/\/wiki\/home$/);
    await expectAccessible(page, 'wiki home');

    await page.getByRole('link', { name: 'New page' }).click();
    await page.getByLabel('Title').fill('Getting started');
    await page
      .getByRole('textbox', { name: 'Content' })
      .fill('Download the modpack from the website.');
    await page.getByLabel('Edit summary').fill('First version');
    await expectAccessible(page, 'wiki editor');
    await page.getByRole('button', { name: 'Create page' }).click();
    await page.waitForURL(/\/wiki\/getting-started$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Getting started' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Pages' })
        .getByRole('link', { name: 'Getting started' }),
    ).toHaveAttribute('aria-current', 'page');
    await expectAccessible(page, 'wiki page');

    await page.getByRole('link', { name: 'Edit' }).click();
    await page
      .getByRole('textbox', { name: 'Content' })
      .fill('Download the modpack from the launcher instead.');
    await page.getByLabel('Edit summary').fill('Use the launcher');
    await page.getByRole('button', { name: 'Save page' }).click();
    await page.waitForURL(/\/wiki\/getting-started$/);
    await expect(page.getByText('from the launcher instead')).toBeVisible();

    await page.getByRole('link', { name: 'History' }).click();
    const rows = page.getByRole('table', { name: 'Revisions, newest first' }).getByRole('row');
    await expect(rows).toHaveCount(3);
    await expectAccessible(page, 'wiki history');
    await rows.nth(1).getByRole('link').first().click();
    await expect(
      page.getByRole('heading', { name: 'Changes from the previous version' }),
    ).toBeVisible();
    await expect(page.locator('ins')).toContainText(['launcher']);
    await expect(page.locator('del')).toContainText(['website']);
    await expectAccessible(page, 'wiki diff');

    await page.goto(`/c/${slug}/wiki/getting-started/history`);
    await rows
      .nth(2)
      .getByRole('button', { name: /Restore version from/ })
      .click();
    await page
      .getByRole('dialog', { name: 'Restore this version?' })
      .getByRole('button', { name: 'Restore' })
      .click();
    await page.waitForURL(/\/wiki\/getting-started$/);
    await expect(page.getByText('from the website.')).toBeVisible();

    await page.goto(`/c/${slug}/wiki/search?q=modpack`);
    await expect(page.getByRole('link', { name: 'Getting started' }).last()).toBeVisible();
    await expectAccessible(page, 'wiki search');
  });

  test('safety: report, moderate, time out and block', async ({ page, browser }) => {
    const owner = await signUp(page, uniqueUser('mod'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const url = await startThread(
      page,
      slug,
      'general',
      'Weekly build contest',
      'Theme this week: castles.',
    );

    const member = await joinAsMember(browser, slug, 'reporter');
    await member.page.goto(url);
    const op = post(member.page, 'Theme this week');
    await op.getByRole('button', { name: /More actions for/ }).click();
    await member.page.getByRole('menuitem', { name: 'Report' }).click();
    const dialog = member.page.getByRole('dialog', { name: 'Report this thread' });
    await dialog.getByRole('radio', { name: 'Spam or advertising' }).check();
    await dialog.getByLabel('Details').fill('Testing the report flow.');
    await expectAccessible(member.page, 'report dialog');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(member.page.getByText('Thanks. The moderators have your report.')).toBeVisible();

    await page.goto(`/c/${slug}/settings/reports`);
    const report = page.getByRole('article').filter({ hasText: 'Testing the report flow.' });
    await expect(report).toBeVisible();
    await expectAccessible(page, 'reports queue');
    await report.getByRole('button', { name: 'Dismiss' }).click();
    await page
      .getByRole('dialog', { name: 'Dismiss this report?' })
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(page.getByText('No open reports. All clear!')).toBeVisible();

    // Time the member out: they can read but the reply box is replaced by a notice.
    await page.goto(`/c/${slug}/settings/members`);
    await expectAccessible(page, 'member settings');
    await page.getByRole('button', { name: `Moderate ${member.user.name}` }).click();
    await page.getByRole('menuitem', { name: 'Time out…' }).click();
    const timeout = page.getByRole('dialog', { name: `Time out ${member.user.name}` });
    await choose(timeout.getByLabel('Duration'), '1 hour');
    await timeout.getByLabel('Reason').fill('Cooling off');
    await timeout.getByRole('button', { name: 'Time out' }).click();
    await expect(page.getByText(/Timed out until/)).toBeVisible();

    await member.page.reload();
    await expect(member.page.getByText("You're timed out")).toBeVisible();
    await expect(member.page.getByRole('textbox', { name: 'Your reply' })).toBeHidden();

    // Blocking is personal: the owner's posts collapse for the member.
    await member.page.goto(`/u/${owner.username}`);
    await member.page.getByRole('button', { name: 'Block' }).click();
    await member.page
      .getByRole('dialog', { name: /^Block / })
      .getByRole('button', { name: 'Block' })
      .click();
    await expect(member.page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    await member.page.goto(url);
    await expect(member.page.getByText('Post from someone you blocked. Show anyway')).toBeVisible();
    await member.page.goto('/settings/privacy');
    await expect(member.page.getByRole('link', { name: owner.name })).toBeVisible();
    await expectAccessible(member.page, 'privacy settings');
    await member.page.getByRole('button', { name: `Unblock ${owner.name}` }).click();
    await expect(member.page.getByText("You haven't blocked anyone.")).toBeVisible();

    await page.goto(`/c/${slug}/settings/members`);
    await page.getByRole('button', { name: `Moderate ${member.user.name}` }).click();
    await page.getByRole('menuitem', { name: 'Ban…' }).click();
    await page
      .getByRole('dialog', { name: `Ban ${member.user.name}` })
      .getByRole('button', { name: 'Ban' })
      .click();
    await page.goto(`/c/${slug}/settings/bans`);
    await expect(page.getByText(member.user.name)).toBeVisible();
    await expectAccessible(page, 'bans');
    await page.getByRole('button', { name: `Unban ${member.user.name}` }).click();
    await expect(page.getByText('Nobody is banned.')).toBeVisible();
    await member.context.close();
  });

  test('channels: a staff-only channel is hidden from members', async ({ page, browser }) => {
    await signUp(page, uniqueUser('admin'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    await page.goto(`/c/${slug}/settings/channels`);
    await expectAccessible(page, 'channel settings');

    await page.getByRole('button', { name: 'New channel' }).click();
    const form = page.getByRole('dialog', { name: 'New channel' });
    await form.getByLabel('Name').fill('Staff Room');
    await expect(form.getByLabel('Name')).toHaveValue('staff-room');
    await form.getByLabel('Topic').fill('Private staff discussion.');
    await expectAccessible(page, 'channel form');
    await form.getByRole('button', { name: 'Create channel' }).click();
    await expect(page.getByText('#staff-room created.')).toBeVisible();

    await page.getByRole('button', { name: 'Permissions for staff-room' }).click();
    const perms = page.getByRole('dialog', { name: 'Permissions for #staff-room' });
    await expect(perms.getByLabel('Role')).toBeVisible();
    const view = perms.getByRole('group', { name: 'View channels' });
    await view.getByText('Deny', { exact: true }).click();
    await expect(view.getByRole('radio', { name: 'Deny' })).toBeChecked();
    await expectAccessible(page, 'channel permissions');
    await perms.getByRole('button', { name: 'Save permissions' }).click();
    await expect(page.getByText('Permissions saved.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Flair name').fill('Bug');
    await page.getByRole('button', { name: 'Add flair' }).click();
    await expect(page.getByText('Flair added.')).toBeVisible();

    await page.getByRole('button', { name: 'Move suggestions up' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'suggestions moved.' })).toBeAttached();

    await page.goto(`/c/${slug}/forum`);
    await expect(page.getByRole('link', { name: 'staff-room' })).toBeVisible();

    const member = await joinAsMember(browser, slug);
    await member.page.goto(`/c/${slug}/forum`);
    await expect(member.page.getByRole('link', { name: 'general', exact: true })).toBeVisible();
    await expect(member.page.getByRole('link', { name: 'staff-room' })).toBeHidden();
    const res = await member.page.goto(`/c/${slug}/forum/staff-room`);
    expect(res?.status()).toBe(404);
    await member.context.close();
  });

  test('back buttons go to the page above, or back where you came from', async ({ page }) => {
    const user = await signUp(page, uniqueUser('back'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    await startThread(page, slug, 'general', 'Where does Back go?', 'Testing back buttons.');
    await page.getByRole('link', { name: 'Back to #general' }).click();
    await page.waitForURL(new RegExp(`/c/${slug}/forum/general$`));
    await page.getByRole('link', { name: 'Back to Forum' }).click();
    await page.waitForURL(new RegExp(`/c/${slug}/forum$`));

    // Within the site, Back returns to the previous page...
    await page.getByRole('link', { name: 'Members', exact: true }).click();
    await page.waitForURL(new RegExp(`/c/${slug}/members$`));
    await page.getByRole('main').getByRole('link', { name: user.name }).click();
    await page.waitForURL(new RegExp(`/u/${user.username}$`));
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await page.waitForURL(new RegExp(`/c/${slug}/members$`));
    // ...and opened directly, it goes home instead of leaving the site.
    await page.goto(`/u/${user.username}`);
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');
  });

  test('thread and wiki pages are accessible in every colour mode', async ({ page }) => {
    await signUp(page, uniqueUser('modes'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const url = await startThread(
      page,
      slug,
      'support',
      'Colour check',
      'Checking every colour mode.',
    );
    await reply(page, 'Replying so there is more than one post.');
    await post(page, 'Replying so').getByRole('button', { name: 'Mark as answer' }).click();
    await expect(page.getByText('Accepted answer')).toBeVisible();
    await page.goto(`/c/${slug}/wiki/home/edit`);
    await page.getByRole('textbox', { name: 'Content' }).fill('Welcome! This page was edited.');
    await page.getByRole('button', { name: 'Save page' }).click();
    await page.waitForURL(/\/wiki\/home$/);
    await page.getByRole('link', { name: 'History' }).click();
    await page.getByRole('table').getByRole('row').nth(1).getByRole('link').first().click();
    await expect(
      page.getByRole('heading', { name: 'Changes from the previous version' }),
    ).toBeVisible();
    const diffUrl = page.url();

    for (const path of [url, `/c/${slug}/forum/support`, `/c/${slug}/wiki/home`, diffUrl]) {
      await page.goto(path);
      for (const [scheme, contrast] of [
        ['dark', 'normal'],
        ['light', 'high'],
        ['dark', 'high'],
      ] as const) {
        await setScheme(page, scheme, contrast);
        await expectAccessible(page, `${path} ${scheme}/${contrast}`);
      }
    }
  });
});
