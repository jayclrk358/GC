import { createECDH, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  choose,
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  signUp,
  uniqueUser,
} from './helpers';

test('search engines and link previews: robots, sitemap, share images', async ({ page }) => {
  await signUp(page, uniqueUser('seo'), '/new');
  const { slug, name } = await createCommunity(page);

  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);

  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(`/c/${slug}</loc>`);

  // The community's page points at its own share image, which is a real picture.
  await page.goto(`/c/${slug}`);
  const og = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  expect(og).toContain(`/c/${slug}/opengraph-image`);
  const image = await page.request.get(new URL(og!).pathname);
  expect(image.headers()['content-type']).toBe('image/png');
  expect((await image.body()).length).toBeGreaterThan(5000);
  expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain(name);
});

test('installable app, push notifications and email round-ups', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Game Central');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  const sw = await page.request.get('/sw.js');
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("addEventListener('push'");

  await signUp(page, uniqueUser('pushy'), '/settings/notifications');
  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Push notifications' })).toBeVisible();

  // A weekly round-up, kept after a reload.
  await choose(page.getByRole('combobox', { name: 'Email round-up' }), 'Weekly');
  await expect(page.getByRole('status').filter({ hasText: /saved/i })).toBeAttached();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Email round-up' })).toHaveText(/Weekly/);
  await expectAccessible(page, 'notification settings');

  // A browser's subscription is saved (this one points at the local fake push service).
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const sub = {
    endpoint: `${FIXTURE_CTL}/push/e2e${Date.now()}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  const saved = await page.request.post('/api/push', { data: sub });
  expect(saved.ok()).toBe(true);
  expect((await page.request.post('/api/push', { data: { endpoint: 'nope' } })).status()).toBe(400);
  const removed = await page.request.delete('/api/push', { data: { endpoint: sub.endpoint } });
  expect(removed.ok()).toBe(true);
});
