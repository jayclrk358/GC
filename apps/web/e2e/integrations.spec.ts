import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  joinAsMember,
  signUp,
  uniqueUser,
} from './helpers';

interface Delivery {
  id: string;
  headers: Record<string, string>;
  body: { event: string; community: { slug: string }; data: Record<string, unknown> } | null;
}

async function deliveries(page: Page, hookId: string): Promise<Delivery[]> {
  const r = await page.request.get(`${FIXTURE_CTL}/hooks`);
  return ((await r.json()).hooks as Delivery[]).filter((h) => h.id === hookId);
}

/** The secret shown once after creating something. */
async function shownSecret(page: Page, title: string) {
  const box = page.getByRole('status').filter({ hasText: title });
  await expect(box).toBeVisible();
  return (await box.locator('code').textContent())!.trim();
}

test('webhooks and the public API', async ({ page, browser }) => {
  await signUp(page, uniqueUser('dev'));
  const { slug } = await createCommunity(page);
  const hookId = `e2e${Date.now()}`;

  // A JSON webhook, with its signing secret shown once.
  await page.goto(`/c/${slug}/settings/integrations`);
  await expect(page.getByRole('heading', { name: 'Integrations', level: 1 })).toBeVisible();
  await expectAccessible(page, 'integrations settings');
  await page.getByLabel('Name', { exact: true }).fill('Ops feed');
  await page.getByLabel('Webhook URL').fill(`${FIXTURE_CTL}/hook/${hookId}`);
  await page.getByRole('checkbox', { name: 'Someone joins' }).check();
  await page.getByRole('checkbox', { name: 'New chat messages' }).check();
  await page.getByRole('button', { name: 'Add webhook' }).click();
  const secret = await shownSecret(page, 'Signing secret');
  expect(secret).toMatch(/^whsec_/);
  await expect(page.getByText(`${FIXTURE_CTL}/hook/${hookId}`)).toBeVisible();

  // A test delivery arrives, signed with that secret.
  await page.getByRole('button', { name: 'Send a test to Ops feed' }).click();
  await expect(page.getByText('Test delivered')).toBeVisible();
  const [ping] = await deliveries(page, hookId);
  expect(ping!.body!.event).toBe('ping');
  expect(ping!.body!.community.slug).toBe(slug);
  const { raw, ...headers } = ping!.headers;
  const expected = createHmac('sha256', secret)
    .update(`${headers['x-gamecentral-timestamp']}.${raw}`)
    .digest('hex');
  expect(headers['x-gamecentral-signature']).toBe(`sha256=${expected}`);
  expect(headers['x-gamecentral-event']).toBe('ping');

  // Someone joining is sent (through the worker).
  const member = await joinAsMember(browser, slug, 'hooked');
  await expect
    .poll(async () =>
      (await deliveries(page, hookId))
        .filter((d) => d.body?.event === 'member.joined')
        .map((d) => (d.body!.data.user as { name: string }).name),
    )
    .toContain(member.user.name);
  await member.context.close();

  // A webhook that fails says so.
  await page.getByLabel('Name', { exact: true }).fill('Broken');
  await page.getByLabel('Webhook URL').fill(`${FIXTURE_CTL}/hook/fail`);
  await page.getByRole('button', { name: 'Add webhook' }).click();
  await shownSecret(page, 'Signing secret');
  await page.getByRole('button', { name: 'Send a test to Broken' }).click();
  await expect(page.getByText('Test failed: The address answered 500.')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete webhook Broken' }).click();
  await expect(page.getByText('Deleted “Broken”')).toBeVisible();

  // Personal API tokens: one that can post, one that can only read.
  await page.goto('/settings/developer');
  await expect(page.getByRole('heading', { name: 'Developer', level: 1 })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Status bot');
  await page.getByRole('switch', { name: 'Can post messages' }).click();
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = await shownSecret(page, 'Your new token');
  expect(token).toMatch(/^mx_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Reader');
  await page.getByRole('button', { name: 'Create token' }).click();
  const readToken = await shownSecret(page, 'Your new token');
  await expect(page.getByText('Read and post')).toBeVisible();
  await expect(page.getByText('Read only')).toBeVisible();
  await expectAccessible(page, 'developer settings');

  const api = (path: string, opts: { token?: string; data?: unknown } = {}) =>
    page.request.fetch(`/api/v1${path}`, {
      method: opts.data ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${opts.token ?? token}` },
      data: opts.data,
    });

  const me = await (await api('/me')).json();
  expect(me.data.communities.map((c: { slug: string }) => c.slug)).toContain(slug);
  const community = await (await api(`/communities/${slug}`)).json();
  expect(community.data.you).toEqual({ member: true, owner: true });
  const { data: channels } = await (await api(`/communities/${slug}/channels`)).json();
  const chat = channels.channels.find((c: { type: string }) => c.type === 'text');
  expect(chat).toBeTruthy();

  // Posting as the token's owner reaches the channel and the webhook.
  const posted = await api(`/channels/${chat.id}/messages`, {
    data: { content: 'Server restarting in 5 minutes' },
  });
  expect(posted.status()).toBe(201);
  const messages = await (await api(`/channels/${chat.id}/messages?limit=5`)).json();
  expect(messages.data.messages.map((m: { content: string }) => m.content)).toContain(
    'Server restarting in 5 minutes',
  );
  await expect
    .poll(async () =>
      (await deliveries(page, hookId))
        .filter((d) => d.body?.event === 'message.created')
        .map((d) => (d.body!.data.message as { content: string }).content),
    )
    .toContain('Server restarting in 5 minutes');

  // Read-only tokens can't post; no token, or a deleted one, gets nothing.
  const denied = await api(`/channels/${chat.id}/messages`, {
    token: readToken,
    data: { content: 'nope' },
  });
  expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete token Reader' }).click();
  await expect(page.getByText('Deleted “Reader”')).toBeVisible();
  expect((await api('/me', { token: readToken })).status()).toBe(401);
  expect((await api(`/communities/does-not-exist-${Date.now()}`)).status()).toBe(404);
});

test('the developer docs', async ({ page }) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: 'Developers', level: 1 })).toBeVisible();
  await expect(page.getByRole('cell', { name: '/channels/{id}/messages' }).first()).toBeVisible();
  await expectAccessible(page, 'developer docs');
});
