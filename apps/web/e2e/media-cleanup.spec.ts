import { expect, test, type Page } from '@playwright/test';
import { createCommunity, post, signUp, uniqueUser } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
  'base64',
);

/** The key of the next file uploaded from the page. */
function nextUpload(page: Page): Promise<string> {
  return page
    .waitForResponse((r) => r.url().endsWith('/api/uploads') && r.request().method() === 'POST')
    .then(async (r) => ((await r.json()) as { key: string }).key);
}

/** Whether the file is still in storage (files are removed in the background, so keep asking). */
async function expectStored(page: Page, key: string, stored: boolean) {
  await expect
    .poll(async () => (await page.request.get(`/media/${key}`)).status(), { timeout: 20_000 })
    .toBe(stored ? 200 : 404);
}

async function sendImage(page: Page, channel: string, text: string): Promise<string> {
  const composer = page.getByRole('textbox', { name: `Message #${channel}` });
  await expect(composer).toBeVisible();
  const uploaded = nextUpload(page);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: `${text}.png`, mimeType: 'image/png', buffer: PNG });
  const key = await uploaded;
  await page.getByLabel('Description of image 1').fill(`Picture for ${text}`);
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 20_000 });
  await composer.click();
  await composer.fill(text);
  await composer.press('Enter');
  const msg = page.locator('article[data-message-id]').filter({ hasText: text });
  await expect(msg.getByText('Sending…')).toBeHidden();
  await expect(msg.getByRole('button', { name: `Picture for ${text}` })).toBeVisible();
  return key;
}

test('deleting messages, threads, channels and communities removes their files', async ({
  page,
}) => {
  const user = uniqueUser('cleanup');
  await signUp(page, user, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // The community's own image.
  await page.goto(`/c/${slug}/settings/appearance`);
  const iconUpload = nextUpload(page);
  await page
    .getByRole('button', { name: 'Icon Upload image' })
    .setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: PNG });
  const icon = await iconUpload;

  // An attachment taken off before sending is thrown away.
  await page.goto(`/c/${slug}/chat/lounge`);
  await page.waitForFunction(() => document.readyState === 'complete');
  const discardedUpload = nextUpload(page);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'oops.png', mimeType: 'image/png', buffer: PNG });
  const discarded = await discardedUpload;
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Remove attachment 1' }).click();
  await expectStored(page, discarded, false);

  // Deleting a message removes its attachments, and only its attachments.
  const kept = await sendImage(page, 'lounge', 'keeper');
  const doomed = await sendImage(page, 'lounge', 'goner');
  const msg = page.locator('article[data-message-id]').filter({ hasText: 'goner' });
  await msg.hover();
  await msg.getByRole('button', { name: `More actions for ${user.name}'s message` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this message?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(msg).toHaveCount(0);
  await expectStored(page, doomed, false);
  await expectStored(page, kept, true);

  // Deleting a channel removes what was posted in it.
  await page.goto(`/c/${slug}/chat/looking-for-group`);
  await page.waitForFunction(() => document.readyState === 'complete');
  const inChannel = await sendImage(page, 'looking-for-group', 'squad');
  await page.goto(`/c/${slug}/settings/channels`);
  await page.getByRole('button', { name: 'Delete looking-for-group' }).click();
  await page
    .getByRole('dialog', { name: 'Delete looking-for-group?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('looking-for-group deleted.')).toBeVisible();
  await expectStored(page, inChannel, false);

  // Deleting a thread removes the images in its posts.
  await page.goto(`/c/${slug}/forum/support/new`);
  await page.getByLabel('Title').fill('Broken portal');
  await page.getByRole('textbox', { name: 'Message' }).fill('See the picture:');
  const threadUpload = nextUpload(page);
  await page
    .locator('input[type=file]:not([multiple])')
    .setInputFiles({ name: 'portal.png', mimeType: 'image/png', buffer: PNG });
  const inThread = await threadUpload;
  const describe = page.getByRole('dialog', { name: 'Describe this image' });
  await describe.getByLabel('Image description').fill('The broken portal');
  await describe.getByRole('button', { name: 'Insert image' }).click();
  await page.getByRole('button', { name: 'Post thread' }).click();
  await page.waitForURL(/\/t\/[0-9a-f-]{36}$/);
  await post(page, 'See the picture')
    .getByRole('button', { name: /More actions for/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete thread' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this thread?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await page.waitForURL(/\/forum\/support$/);
  await expectStored(page, inThread, false);

  // Deleting the community removes its own images and everything still posted in it.
  await expectStored(page, icon, true);
  await page.goto(`/c/${slug}/settings/danger`);
  await page.getByLabel(`Type ${slug} to confirm`).fill(slug);
  await page.getByRole('button', { name: 'Delete this community' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expectStored(page, icon, false);
  await expectStored(page, kept, false);
});
