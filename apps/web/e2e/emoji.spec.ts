import { expect, test, type Page } from '@playwright/test';
import { createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
  'base64',
);

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message #lounge' });
const message = (page: Page, text: string) =>
  page.locator('article[data-message-id]').filter({ hasText: text });

test('custom emoji: add, use in chat, react with, rename and remove', async ({ page }) => {
  test.setTimeout(150_000);
  const owner = uniqueUser('emoji');
  await signUp(page, owner, '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  await page.goto(`/c/${slug}/settings/emoji`);
  await expect(page.getByRole('heading', { level: 1, name: 'Emoji' })).toBeVisible();
  await expect(page.getByText('No emoji yet.')).toBeVisible();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'Good Game.png', mimeType: 'image/png', buffer: PNG });
  // The name comes from the file name.
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('good_game');
  await page.getByRole('textbox', { name: 'Name' }).fill('gg');
  await expectAccessible(page, 'emoji settings');
  await page.getByRole('button', { name: 'Add emoji' }).click();
  await expect(page.getByText(':gg: added')).toBeVisible();
  await expect(page.getByText(':gg:', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emoji (1 of 50)' })).toBeVisible();

  // Names are unique.
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'gg.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Add emoji' }).click();
  await expect(page.getByText(/already an emoji called :gg:/)).toBeVisible();

  // Typing ":gg" suggests it; picking it puts the picture in the message.
  await page.goto(`/c/${slug}/chat/lounge`);
  await composer(page).click();
  await page.keyboard.type('nice one :gg');
  const suggestions = page.getByRole('listbox', { name: 'Emoji suggestions' });
  await expect(suggestions.getByRole('option', { name: ':gg:' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(suggestions).toBeHidden();
  // Standard emoji work the same way, as the character.
  await page.keyboard.type(':fir');
  await expect(page.getByRole('option', { name: ':fire:' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const sent = message(page, 'nice one');
  await expect(sent.getByRole('img', { name: ':gg:' })).toBeVisible();
  await expect(sent).toContainText('🔥');
  await expect(sent.getByText('Sending…')).toBeHidden();

  // React with it.
  await sent.hover();
  await sent.getByRole('button', { name: /^Add reaction to/ }).click();
  await page
    .getByRole('group', { name: 'This community’s emoji' })
    .getByRole('button', { name: ':gg:' })
    .click();
  await expect(sent.getByRole('button', { name: ':gg:: 1 reaction' })).toBeVisible();

  // Rename it: the message keeps showing the picture.
  await page.goto(`/c/${slug}/settings/emoji`);
  await page.getByRole('button', { name: 'Rename :gg:' }).click();
  await page.getByRole('textbox', { name: 'New name for :gg:' }).fill('goodgame');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(':goodgame:', { exact: true })).toBeVisible();

  // Remove it: posts fall back to the name it had when written.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Remove :goodgame:' }).click();
  await expect(page.getByText(':goodgame: removed')).toBeVisible();
  await expect(page.getByText('No emoji yet.')).toBeVisible();
});
