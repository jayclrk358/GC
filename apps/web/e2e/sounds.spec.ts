import { expect, test, type Page } from '@playwright/test';
import { choose, createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

/** Count the tones a page starts: every sound effect is a few of them. */
async function countTones(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args) {
      w.__tones++;
      return start.apply(this, args);
    };
  });
}
const tones = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tones: number }).__tones);

test('sound effects play, can be changed, and turned off', async ({ page }) => {
  await countTones(page);
  await signUp(page, uniqueUser('ears'), '/new');
  await createCommunity(page);
  // A little fanfare for a new community.
  await expect.poll(() => tones(page)).toBeGreaterThan(0);

  await page.goto('/settings/sounds');
  await expectAccessible(page, 'sound settings');
  await page.getByRole('radio', { name: /^Arcade/ }).click();
  await choose(page.getByRole('combobox', { name: 'Mentions and replies' }), 'Crystal');
  await choose(page.getByRole('combobox', { name: 'New messages' }), 'Sound pack (Arcade)');
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeAttached();
  const before = await tones(page);
  await page.getByRole('button', { name: 'Listen to Arcade' }).click();
  await page.getByRole('button', { name: 'Play: Mentions and replies' }).click();
  await expect.poll(() => tones(page)).toBeGreaterThan(before);

  await page.reload();
  await expect(page.getByRole('radio', { name: /^Arcade/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Mentions and replies' })).toContainText(
    'Crystal',
  );
  await expect(page.getByRole('combobox', { name: 'New messages' })).toContainText(
    'Sound pack (Arcade)',
  );

  // Off: silence, and the choices rest until it's back on.
  await page.getByRole('switch', { name: 'Play sound effects' }).click();
  await expect(page.getByRole('button', { name: 'Listen to Arcade' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Mentions and replies' })).toBeDisabled();
});
