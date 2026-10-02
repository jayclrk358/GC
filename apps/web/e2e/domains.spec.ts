import { request as httpRequest } from 'node:http';
import { expect, test } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  signUp,
  uniqueUser,
  upgradeCommunity,
} from './helpers';

/** A request to the app as if it came in on another domain (Caddy passes the Host through). */
function onDomain(host: string, path: string) {
  return new Promise<{ status: number; location?: string; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: 3000, path, headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

test('a community on its own domain', async ({ page }) => {
  await signUp(page, uniqueUser('domains'));
  const { name, slug } = await createCommunity(page);
  const domain = `play-${Date.now().toString(36)}.magnox-e2e.test`;

  // A Pro perk: on Free the form is locked.
  await page.goto(`/c/${slug}/settings/domain`);
  await expect(page.getByText('Custom domains need Pro.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Domain' })).toBeDisabled();

  await upgradeCommunity(page, slug, 'Pro');
  await page.goto(`/c/${slug}/settings/domain`);
  await page.getByRole('textbox', { name: 'Domain' }).fill(`https://${domain.toUpperCase()}/`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Now add the DNS records below.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Domain' })).toHaveValue(domain);
  const records = page.locator('dl');
  await expect(records.first()).toContainText('CNAME');
  const txtValue = (await records.nth(1).locator('dd').nth(2).textContent())!.trim();
  expect(txtValue).toMatch(/^magnox-verify=[0-9a-f]{32}$/);
  await expectAccessible(page, 'custom domain settings');

  // Before the DNS records exist, the check explains what's missing.
  await page.getByRole('button', { name: 'Check DNS' }).click();
  await expect(page.getByText('The DNS records aren’t right yet')).toBeVisible();
  await expect(page.getByText(/The TXT record isn’t there yet/)).toBeVisible();

  // Add them (to the fixture DNS server), check again, and it's live.
  await page.request.post(`${FIXTURE_CTL}/dns`, {
    data: { name: `_magnox.${domain}`, type: 'TXT', value: txtValue },
  });
  await page.request.post(`${FIXTURE_CTL}/dns`, {
    data: { name: domain, type: 'CNAME', value: 'localhost' },
  });
  await page.getByRole('button', { name: 'Check DNS' }).click();
  await expect(page.getByText('Your domain is ready')).toBeVisible();
  await expect(page.getByText(`${domain} is set up`)).toBeVisible();

  // Caddy may get it a certificate; other domains are refused.
  const check = await page.request.get(`/api/domains/check?domain=${domain}`);
  expect(await check.json()).toEqual({ slug });
  expect((await page.request.get('/api/domains/check?domain=unknown.example')).status()).toBe(404);

  // The domain shows the community; the rest of the site stays on the main address.
  const home = await onDomain(domain, '/');
  expect(home.status).toBe(200);
  expect(home.body).toContain(name);
  expect((await onDomain(domain, `/c/${slug}/forum`)).status).not.toBe(307);
  // (Next shortens the address to a path here because the site's own address is the one it's
  // listening on; behind Caddy it's the full https:// address of the main site.)
  const away = await onDomain(domain, '/sign-in?next=%2F');
  expect(away.status).toBe(307);
  expect(away.location).toMatch(/^(http:\/\/localhost:3000)?\/sign-in\?next=%2F$/);
  const other = await onDomain(domain, '/c/someone-else');
  expect(other.status).toBe(307);
  expect(other.location).toMatch(/^(http:\/\/localhost:3000)?\/c\/someone-else$/);

  // Removing it stops it at once.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Domain removed')).toBeVisible();
  expect((await page.request.get(`/api/domains/check?domain=${domain}`)).status()).toBe(404);
});
