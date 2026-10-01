import { expect, test } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  joinAsMember,
  signUp,
  uniqueUser,
  upgradeCommunity,
} from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
  'base64',
);

test('separators, chat backgrounds and voice channels come with Plus', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = uniqueUser('voice');
  await signUp(page, owner, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // On Free they're locked, with a way to upgrade.
  await page.goto(`/c/${slug}/settings/channels`);
  await page.getByRole('button', { name: 'New separator' }).click();
  const sepDialog = page.getByRole('dialog', { name: 'New separator' });
  await expect(sepDialog.getByText('Custom separators need Plus.')).toBeVisible();
  await expect(sepDialog.getByRole('link', { name: 'Get Plus' })).toHaveAttribute(
    'href',
    `/c/${slug}/settings/billing`,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New channel' }).click();
  const newChannel = page.getByRole('dialog', { name: 'New channel' });
  await expect(newChannel.getByText('Voice channels need Plus.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit lounge' }).click();
  await expect(
    page.getByRole('dialog', { name: /lounge/ }).getByText('Chat channel backgrounds need Plus.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await upgradeCommunity(page, slug);

  // A separator between channels.
  await page.goto(`/c/${slug}/settings/channels`);
  await page.getByRole('button', { name: 'New separator' }).click();
  const sep = page.getByRole('dialog', { name: 'New separator' });
  await sep.getByLabel('Label').fill('Squads');
  await sep.getByRole('button', { name: 'Create' }).click();
  await expect(sep).toBeHidden();

  // A voice channel.
  await page.getByRole('button', { name: 'New channel' }).click();
  const form = page.getByRole('dialog', { name: 'New channel' });
  await form.getByLabel('Type').click();
  await page.getByRole('option', { name: 'Voice' }).click();
  await form.getByLabel('Name').fill('hangout');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('#hangout created.')).toBeVisible();

  // A picture behind #lounge.
  await page.getByRole('button', { name: 'Edit lounge' }).click();
  const edit = page.getByRole('dialog', { name: /lounge/ });
  await edit
    .getByRole('button', { name: /Background image/ })
    .setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: PNG });
  await expect(edit.getByRole('img', { name: /Background image/ })).toBeVisible();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('#lounge saved.')).toBeVisible();

  await page.goto(`/c/${slug}/chat/lounge`);
  const channels = page.getByRole('navigation', { name: 'Channels' }).first();
  await expect(channels.getByRole('separator', { name: 'Squads' })).toBeVisible();
  await expect(channels.getByRole('link', { name: /hangout/ })).toBeVisible();
  await expect(page.locator('[data-decorative] img[src*="-md.webp"]')).toHaveCount(1);
  await expectAccessible(page, 'chat with background');

  // Voice: join, and a member sees who's there, joins, and hears you.
  await channels.getByRole('link', { name: /hangout/ }).click();
  await page.getByRole('button', { name: 'Join voice' }).click();
  const room = page.getByRole('list', { name: /in voice/ }).last();
  await expect(room.getByText(`${owner.name} (you)`)).toBeVisible({ timeout: 20_000 });
  // Screen sharing is a Pro perk.
  await expect(page.getByRole('button', { name: 'Share screen' })).toHaveCount(0);
  await expectAccessible(page, 'voice channel');

  const member = await joinAsMember(browser, slug, 'listener');
  await member.page.goto(`/c/${slug}/chat/hangout`);
  const theirView = member.page.getByRole('main');
  await expect(theirView.getByText(owner.name).first()).toBeVisible({ timeout: 20_000 });
  await member.page.getByRole('button', { name: 'Join voice' }).click();
  await expect(member.page.getByRole('list', { name: '2 people in voice' }).last()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('list', { name: '2 people in voice' }).last()).toBeVisible({
    timeout: 20_000,
  });

  // Muting shows for everyone in the call.
  const mute = page
    .getByRole('group', { name: 'Call controls' })
    .getByRole('button', { name: 'Mute', exact: true });
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(room.getByRole('img', { name: 'Microphone off' })).toHaveCount(0);
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(
    member.page
      .getByRole('list', { name: '2 people in voice' })
      .last()
      .getByRole('img', { name: 'Microphone off' }),
  ).toBeVisible({ timeout: 10_000 });

  // Moderators can take someone out of the call; they can come back.
  await room.getByRole('button', { name: `Remove ${member.user.name} from the call` }).click();
  await expect(member.page.getByText('You were removed from the voice channel.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('list', { name: '1 person in voice' }).last()).toBeVisible({
    timeout: 20_000,
  });
  await member.page.getByRole('button', { name: 'Join voice' }).click();
  await expect(page.getByRole('list', { name: '2 people in voice' }).last()).toBeVisible({
    timeout: 20_000,
  });

  // The call carries on while browsing (in the page, not after a reload), with a small bar.
  await channels.getByRole('link', { name: /lounge/ }).click();
  await page.waitForURL(new RegExp(`/c/${slug}/chat/lounge$`));
  const bar = page.getByRole('complementary', { name: 'Voice call' });
  await expect(bar.getByText('hangout')).toBeVisible();
  await bar.getByRole('button', { name: 'Leave' }).click();
  await expect(bar).toBeHidden();
  await expect(member.page.getByRole('list', { name: '1 person in voice' }).last()).toBeVisible({
    timeout: 20_000,
  });

  // Kicking someone takes them out of voice too (their ticket was only checked on the way in).
  await expect(member.page.getByText('You were removed from the voice channel.')).toBeHidden();
  await page.goto(`/c/${slug}/settings/members`);
  await page.getByRole('button', { name: `Moderate ${member.user.name}` }).click();
  await page.getByRole('menuitem', { name: 'Kick…' }).click();
  await page
    .getByRole('dialog', { name: `Kick ${member.user.name}` })
    .getByRole('button', { name: 'Kick' })
    .click();
  await expect(page.getByText(`${member.user.name} was kicked.`)).toBeVisible();
  await expect(member.page.getByText('You were removed from the voice channel.')).toBeVisible({
    timeout: 20_000,
  });
  await page.goto(`/c/${slug}/chat/hangout`);
  await expect(page.getByText("Nobody's here yet. Join to start talking.")).toBeVisible();
  await member.context.close();
});
