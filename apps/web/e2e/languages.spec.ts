import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { choose, expectAccessible, signUp, uniqueUser } from './helpers';

type Messages = Record<string, Record<string, unknown>>;
const messages = (locale: string): Messages =>
  JSON.parse(readFileSync(join(__dirname, '..', 'messages', `${locale}.json`), 'utf8')) as Messages;
const es = messages('es');
const de = messages('de');
const en = messages('en');

test.describe('languages', () => {
  test.use({ locale: 'es-ES' });

  test('follows the browser’s language, and can be chosen', async ({ page }) => {
    // A Spanish browser gets Spanish.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: String(es.shell!.explore) })).toBeVisible();
    await expectAccessible(page, 'home in Spanish');

    // Choosing German in the display settings switches straight away and sticks.
    // (The sign-up helper fills in the English form.)
    await page.setExtraHTTPHeaders({ 'accept-language': 'en' });
    await signUp(page, uniqueUser('idioma'), '/settings/accessibility');
    await page.setExtraHTTPHeaders({ 'accept-language': 'es-ES,es;q=0.9' });
    await page.goto('/settings/accessibility');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const prefs = es.prefs as Record<string, string>;
    await choose(page.getByRole('combobox', { name: prefs.language }), 'Deutsch');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(
      page.getByRole('heading', { name: String((de.prefs as Record<string, string>).title) }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expectAccessible(page, 'settings in German');

    // Back to automatic: the browser's language again.
    await choose(
      page.getByRole('combobox', { name: String((de.prefs as Record<string, string>).language) }),
      String((de.prefs as Record<string, string>).languageAuto),
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});

test('English stays the default', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: String(en.shell!.explore) }),
  ).toBeVisible();
});
