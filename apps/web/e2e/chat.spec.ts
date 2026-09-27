import { expect, test, type Page } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  joinAsMember,
  setScheme,
  signUp,
  uniqueUser,
} from './helpers';

const composer = (page: Page, channel = 'lounge') =>
  page.getByRole('textbox', { name: `Message #${channel}` });
const message = (page: Page, text: string | RegExp) =>
  page.locator('article[data-message-id]').filter({ hasText: text });

async function openChat(page: Page, slug: string, channel = 'lounge') {
  await page.goto(`/c/${slug}/chat/${channel}`);
  await expect(composer(page, channel)).toBeVisible();
  // The socket must be subscribed before the other side sends anything.
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(500);
}

async function send(page: Page, text: string, channel = 'lounge') {
  const box = composer(page, channel);
  await box.click();
  await box.fill(text);
  await box.press('Enter');
  await expect(message(page, text)).toBeVisible();
  await expect(message(page, text).getByText('Sending…')).toBeHidden();
}

async function mention(page: Page, username: string, channel = 'lounge') {
  const box = composer(page, channel);
  await box.click();
  await page.keyboard.type(`@${username.slice(0, 10)}`);
  await expect(page.getByRole('option', { name: new RegExp(username) })).toBeVisible();
  await page.keyboard.press('Enter');
}

test.describe('chat', () => {
  test('two people chat live: typing, mentions, replies, reactions, edits and deletes', async ({
    page,
    browser,
  }) => {
    const owner = await signUp(page, uniqueUser('host'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const member = await joinAsMember(browser, slug, 'guest');
    await openChat(page, slug);
    await openChat(member.page, slug);
    await expectAccessible(page, 'chat');

    // Typing shows up on the other side.
    await composer(page).click();
    await page.keyboard.type('Hello');
    await expect(member.page.getByText(`${owner.name} is typing…`)).toBeVisible();
    await composer(page).press('Enter');
    await expect(message(member.page, 'Hello')).toBeVisible();
    await expect(member.page.getByText(`${owner.name} is typing…`)).toBeHidden();

    // A mention highlights the message and notifies the member.
    await mention(page, member.user.username);
    await page.keyboard.type('can you help with the build?');
    await page.keyboard.press('Enter');
    const pinged = message(member.page, 'can you help with the build?');
    await expect(pinged).toBeVisible();
    await expect(pinged.getByText('Mentions you')).toBeVisible();
    await expect(
      member.page.getByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeVisible();
    // Mentions are announced by default (verbosity: only mentions).
    await expect(member.page.getByTestId('chat-announcer')).toContainText(
      `${owner.name} mentioned you`,
    );

    // Reply and react.
    await pinged.hover();
    await pinged.getByRole('button', { name: `Reply to ${owner.name}` }).click();
    await expect(member.page.getByText(`Replying to ${owner.name}`)).toBeVisible();
    await composer(member.page).fill('On my way!');
    await composer(member.page).press('Enter');
    const reply = message(page, 'On my way!');
    await expect(reply).toBeVisible();
    await expect(reply.getByRole('button', { name: /can you help with the build/ })).toBeVisible();

    const hello = message(member.page, 'Hello');
    await hello.hover();
    await hello.getByRole('button', { name: `Add reaction to ${owner.name}'s message` }).click();
    await member.page.getByRole('button', { name: 'thumbs up' }).click();
    await expect(
      message(page, 'Hello').getByRole('button', { name: 'thumbs up: 1 reaction' }),
    ).toBeVisible();

    // ArrowUp in an empty composer edits your last message.
    await composer(page).click();
    await composer(page).press('ArrowUp');
    const edit = page.getByRole('textbox', { name: 'Edit message' });
    await expect(edit).toBeVisible();
    await edit.fill('can you help with the castle?');
    await edit.press('Enter');
    await expect(
      message(member.page, 'can you help with the castle?').getByText('(edited)'),
    ).toBeVisible();

    // Deleting removes it for everyone.
    const doomed = message(page, 'Hello');
    await doomed.hover();
    await doomed.getByRole('button', { name: `More actions for ${owner.name}'s message` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this message?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(message(member.page, /^Hello/)).toHaveCount(0);
    await expectAccessible(member.page, 'chat (member)');
    await member.context.close();
  });

  test('unread badges, jump to unread, pins, search and permalinks', async ({ page, browser }) => {
    await signUp(page, uniqueUser('pins'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const member = await joinAsMember(browser, slug, 'reader');
    await openChat(member.page, slug, 'looking-for-group');

    await openChat(page, slug);
    await send(page, 'First announcement about the castle build');
    await mention(page, member.user.username);
    await page.keyboard.type('please read this');
    await page.keyboard.press('Enter');
    await expect(message(page, 'please read this')).toBeVisible();

    // The member is in another channel: the sidebar shows unread and a mention badge.
    const lounge = member.page
      .getByRole('navigation', { name: 'Chat channels' })
      .getByRole('link', { name: /lounge/ });
    await expect(lounge).toContainText('1 mention');
    await lounge.click();
    await expect(member.page.getByRole('separator', { name: 'New messages' })).toBeAttached();
    await expect(member.page.getByText(/New messages since/)).toBeVisible();
    await expect(lounge).not.toContainText('mention');

    // Pin a message and find it in the pins panel.
    const first = message(page, 'First announcement');
    await first.hover();
    await first.getByRole('button', { name: /More actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Pin' }).click();
    await expect(first.getByText('Pinned')).toBeVisible();
    await page.getByRole('button', { name: 'Pinned messages' }).click();
    const panel = page.getByRole('complementary', { name: 'Pinned messages' });
    await expect(panel.getByText('First announcement about the castle build')).toBeVisible();
    await expectAccessible(page, 'pins panel');

    // Search finds messages with operators.
    await page.getByRole('button', { name: 'Search messages' }).first().click();
    const search = page.getByRole('complementary', { name: 'Search messages' });
    await search.getByRole('searchbox', { name: 'Search messages' }).fill('castle in:lounge');
    await search.getByRole('searchbox', { name: 'Search messages' }).press('Enter');
    await expect(search.getByText('1 message found')).toBeVisible();
    await expect(search.locator('mark')).toContainText('castle');
    await expectAccessible(page, 'search panel');

    // Permalinks open the channel scrolled to the message.
    const id = await first.getAttribute('data-message-id');
    await member.page.goto(`/c/${slug}/m/${id}`);
    await member.page.waitForURL(new RegExp(`/chat/lounge\\?m=${id}`));
    await expect(member.page.locator(`#msg-${id}`)).toBeVisible();
    // Let the page finish hydrating: a click during hydration is replayed afterwards and can land
    // on the menu it just opened.
    await member.page.waitForFunction(() => document.readyState === 'complete');
    await member.page.waitForTimeout(500);

    // Chat messages can be reported; moderators see them in the queue with a link back.
    const reported = message(member.page, 'First announcement');
    await reported.hover();
    await reported.getByRole('button', { name: /More actions for/ }).click();
    await member.page.getByRole('menuitem', { name: 'Report' }).click();
    const dialog = member.page.getByRole('dialog', { name: 'Report this message' });
    await dialog.getByLabel('Details').fill('Testing chat reports.');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(member.page.getByText('Thanks. The moderators have your report.')).toBeVisible();
    await page.goto(`/c/${slug}/settings/reports`);
    const report = page.getByRole('article').filter({ hasText: 'Testing chat reports.' });
    await expect(report.getByText('Chat message')).toBeVisible();
    await expect(report.getByRole('link', { name: 'View in context' })).toHaveAttribute(
      'href',
      `/c/${slug}/m/${id}`,
    );
    await member.context.close();
  });

  test('keyboard navigation and screen reader announcements', async ({ page, browser }) => {
    await signUp(page, uniqueUser('keys'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const member = await joinAsMember(browser, slug, 'talker');
    await openChat(page, slug);
    await openChat(member.page, slug);
    await send(page, 'Line one');
    await send(page, 'Line two');
    await send(page, 'Line three');

    // Arrow keys move between messages; R replies; Escape returns to the composer.
    const last = message(page, 'Line three');
    await last.focus();
    await page.keyboard.press('ArrowUp');
    await expect(message(page, 'Line two')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(message(page, 'Line one')).toBeFocused();
    await page.keyboard.press('r');
    await expect(page.getByText(/^Replying to /)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel reply' }).click();
    await message(page, 'Line one').focus();
    await page.keyboard.press('Escape');
    await expect(composer(page)).toBeFocused();

    // Switch announcements to every message: the other person's messages are read out.
    await page.getByRole('button', { name: /^Announce/ }).click();
    await page.getByRole('menuitemradio', { name: 'All new messages' }).click();
    await expect(page.getByRole('button', { name: /^Announce: All new messages/ })).toBeVisible();
    await send(member.page, 'Can everyone hear me?');
    await expect(page.getByTestId('chat-announcer')).toContainText(
      `${member.user.name}: Can everyone hear me?`,
    );
    // And off means silence.
    await page.getByRole('button', { name: /^Announce/ }).click();
    await page.getByRole('menuitemradio', { name: 'Off' }).click();
    await send(member.page, 'Second question');
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('chat-announcer')).not.toContainText('Second question');
    await member.context.close();
  });

  test('link previews, image attachments and slow mode', async ({ page, browser }) => {
    await signUp(page, uniqueUser('media'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    await openChat(page, slug);

    // The worker fetches the page (following a redirect) behind the SSRF guard.
    const name = `p${Date.now().toString(36)}`;
    await send(page, `Look at ${FIXTURE_CTL}/go/${name}`);
    const withLink = message(page, 'Look at');
    await expect(withLink.getByRole('link', { name: `Fixture page ${name}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(withLink.getByText('Magnox Fixtures')).toBeVisible();

    // Attach an image with alt text.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page
      .locator('input[type=file][multiple]')
      .setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: png });
    const alt = page.getByLabel('Description of image 1');
    await expect(alt).toBeVisible();
    await expect(page.getByRole('img', { name: 'Uploading' })).toBeHidden();
    await alt.fill('Map of the spawn area');
    await composer(page).click();
    await composer(page).fill('Here is the map');
    await composer(page).press('Enter');
    await expect(
      message(page, 'Here is the map').getByRole('img', { name: 'Map of the spawn area' }),
    ).toBeVisible();

    // Slow mode: a member waits between messages (owners are exempt, so use a member).
    await page.goto(`/c/${slug}/settings/channels`);
    await page.getByRole('button', { name: 'Edit lounge' }).click();
    const form = page.getByRole('dialog', { name: 'Edit #lounge' });
    await form.getByLabel('Slow mode').selectOption('30');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('#lounge saved.')).toBeVisible();
    const member = await joinAsMember(browser, slug, 'slow');
    await openChat(member.page, slug);
    await expect(member.page.getByText('Slow mode: one message every 30 seconds')).toBeVisible();
    await send(member.page, 'First!');
    await expect(
      member.page.getByRole('button', { name: /Slow mode: you can send in \d+ seconds/ }),
    ).toBeDisabled();
    await member.context.close();
  });

  test('chat is accessible in every colour mode', async ({ page }) => {
    await signUp(page, uniqueUser('modes'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    await openChat(page, slug);
    await send(page, 'Colour check');
    for (const [scheme, contrast] of [
      ['dark', 'normal'],
      ['light', 'high'],
      ['dark', 'high'],
    ] as const) {
      await setScheme(page, scheme, contrast);
      await expectAccessible(page, `chat ${scheme}/${contrast}`);
    }
  });
});
