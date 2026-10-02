import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { choose, expectAccessible, signUp, uniqueUser } from './helpers';

type Messages = Record<string, Record<string, string>>;
const messages = (locale: string): Messages =>
  JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as Messages;
const es = messages('es');
const de = messages('de');
const en = messages('en');

test('follows the browser’s language, and can be chosen', async ({ browser }) => {
  // Sign up in English (the helper fills in the English form), then carry on in a Spanish browser.
  const english = await browser.newContext({ locale: 'en-US' });
  await signUp(await english.newPage(), uniqueUser('idioma'));
  const storageState = await english.storageState();
  await english.close();
  const context = await browser.newContext({ locale: 'es-ES', storageState });
  const page = await context.newPage();

  // A Spanish browser gets Spanish.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: es.shell!.explore })).toBeVisible();
  await expectAccessible(page, 'home in Spanish');

  // Choosing German in the display settings switches straight away and sticks.
  await page.goto('/settings/accessibility');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await choose(page.getByRole('combobox', { name: es.prefs!.language }), 'Deutsch');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { name: de.prefs!.title, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expectAccessible(page, 'settings in German');

  // Back to automatic: the browser's language again.
  await choose(page.getByRole('combobox', { name: de.prefs!.language }), de.prefs!.languageAuto!);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await context.close();
});

test('English stays the default', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: en.shell!.explore }),
  ).toBeVisible();
});
