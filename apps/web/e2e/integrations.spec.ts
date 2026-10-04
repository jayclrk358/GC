import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ENDPOINTS } from '../src/lib/api-docs';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  joinAsMember,
  setScheme,
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
  await page.getByRole('switch', { name: 'Can post and make changes' }).click();
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = await shownSecret(page, 'Your new token');
  expect(token).toMatch(/^mx_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Reader');
  await page.getByRole('button', { name: 'Create token' }).click();
  const readToken = await shownSecret(page, 'Your new token');
  await expect(page.getByText('Read and write')).toBeVisible();
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

/** A token made in Settings → Developer. */
async function makeToken(page: Page, name: string, write: boolean) {
  await page.goto('/settings/developer');
  await page.getByLabel('Name', { exact: true }).fill(name);
  if (write) await page.getByRole('switch', { name: 'Can post and make changes' }).click();
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = await shownSecret(page, 'Your new token');
  await page.getByRole('button', { name: 'Done' }).click();
  return token;
}

/**
 * The real response has exactly the fields the docs show for that endpoint, and so do the first
 * items of its lists and its nested objects: the docs and the API can't drift apart.
 */
function expectDocumented(id: string, data: unknown) {
  const endpoint = ENDPOINTS.find((e) => e.id === id);
  if (!endpoint) throw new Error(`No documented endpoint ${id}`);
  const compare = (example: unknown, actual: unknown, where: string) => {
    if (!example || typeof example !== 'object' || Array.isArray(example)) return;
    if (!actual || typeof actual !== 'object') return;
    expect(Object.keys(actual).sort(), where).toEqual(Object.keys(example).sort());
    for (const [key, value] of Object.entries(example)) {
      const real = (actual as Record<string, unknown>)[key];
      if (Array.isArray(value) && Array.isArray(real) && value.length && real.length) {
        compare(value[0], real[0], `${where}.${key}[0]`);
      } else if (!Array.isArray(value)) {
        compare(value, real, `${where}.${key}`);
      }
    }
  };
  compare(endpoint.response, data, id);
}

function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

test('the public API: people, members, forums, wiki, events, reactions and servers', async ({
  page,
}) => {
  const user = await signUp(page, uniqueUser('api'));
  const { slug, name } = await createCommunity(page);

  // An event to answer.
  await page.goto(`/c/${slug}/events`);
  await page.getByRole('link', { name: 'New event' }).first().click();
  await page.getByLabel('Name').fill('Raid night');
  await page.getByLabel('Where').fill('EU-1 server');
  const date = inDays(3);
  await page.getByLabel('Starts').fill(date);
  await page.getByLabel('Start time').fill('20:00');
  await page.getByRole('textbox', { name: 'Ends', exact: true }).fill(date);
  await page.getByLabel('End time').fill('22:00');
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Raid night' })).toBeVisible();

  const token = await makeToken(page, 'Bot', true);
  const readToken = await makeToken(page, 'Reader', false);
  const call = async (method: string, path: string, data?: unknown, as = token) => {
    const res = await page.request.fetch(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${as}` },
      data,
    });
    // Playwright's json() is loosely typed, which suits poking at responses.
    return { status: res.status(), body: await res.json() };
  };

  // People.
  const me = await call('GET', '/me');
  expectDocumented('get-me', me.body.data);
  const profile = await call('GET', `/users/${user.username}`);
  expect(profile.status).toBe(200);
  expect(profile.body.data.username).toBe(user.username);
  expectDocumented('get-user', profile.body.data);
  expect((await call('GET', '/users/nobody_here_at_all')).status).toBe(404);

  // Communities: the directory, members and roles.
  const directory = await call('GET', `/communities?q=${encodeURIComponent(name)}&limit=5`);
  expect(directory.body.data.communities.map((c: { slug: string }) => c.slug)).toContain(slug);
  expectDocumented('list-communities', directory.body.data);
  expectDocumented('get-community', (await call('GET', `/communities/${slug}`)).body.data);
  const members = await call('GET', `/communities/${slug}/members`);
  expect(members.body.data.members).toEqual([
    expect.objectContaining({ id: me.body.data.id, owner: true }),
  ]);
  expectDocumented('list-members', members.body.data);
  const roles = await call('GET', `/communities/${slug}/roles`);
  expect(roles.body.data.roles.some((r: { everyone: boolean }) => r.everyone)).toBe(true);
  expectDocumented('list-roles', roles.body.data);
  const { data: channelList } = (await call('GET', `/communities/${slug}/channels`)).body;
  expectDocumented('list-channels', channelList);
  const chat = channelList.channels.find((c: { type: string }) => c.type === 'text');
  const forum = channelList.channels.find((c: { type: string }) => c.type === 'forum');

  // Chat: send, read one, edit, react (twice is the same as once), pins, delete.
  const sent = await call('POST', `/channels/${chat.id}/messages`, {
    content: 'Hello from the API',
    nonce: `e2e-${Date.now()}`,
  });
  expect(sent.status).toBe(201);
  expectDocumented('send-message', sent.body.data);
  const id = sent.body.data.id;
  expectDocumented('get-message', (await call('GET', `/messages/${id}`)).body.data);
  expectDocumented(
    'list-messages',
    (await call('GET', `/channels/${chat.id}/messages?limit=5`)).body.data,
  );
  const edited = await call('PATCH', `/messages/${id}`, { content: 'Hello again from the API' });
  expect(edited.body.data).toMatchObject({ content: 'Hello again from the API' });
  expect(edited.body.data.editedAt).not.toBeNull();
  expectDocumented('edit-message', edited.body.data);
  const thumbs = `/messages/${id}/reactions/${encodeURIComponent('👍')}`;
  expect((await call('PUT', thumbs)).body.data).toEqual({ emoji: '👍', reacted: true, count: 1 });
  expect((await call('PUT', thumbs)).body.data).toEqual({ emoji: '👍', reacted: true, count: 1 });
  expect((await call('DELETE', thumbs)).body.data).toEqual({
    emoji: '👍',
    reacted: false,
    count: 0,
  });
  expect((await call('PUT', `/messages/${id}/reactions/nope`)).status).toBe(422);
  expect((await call('GET', `/channels/${chat.id}/pins`)).body.data).toEqual({ messages: [] });
  // A read-only token can't change anything.
  expect((await call('PATCH', `/messages/${id}`, { content: 'x' }, readToken)).status).toBe(403);
  expect((await call('PUT', thumbs, undefined, readToken)).status).toBe(403);
  expect((await call('DELETE', `/messages/${id}`)).body.data).toEqual({ id, deleted: true });
  expect((await call('GET', `/messages/${id}`)).status).toBe(404);

  // Forums: start a thread, reply, read them back.
  const started = await call('POST', `/communities/${slug}/threads`, {
    channelId: forum.id,
    title: 'Posted by a bot',
    content: 'First post from the API.\n\nSecond paragraph.',
  });
  expect(started.status).toBe(201);
  expectDocumented('create-thread', started.body.data);
  const threadId = started.body.data.id;
  expectDocumented('get-thread', (await call('GET', `/threads/${threadId}`)).body.data);
  const replied = await call('POST', `/threads/${threadId}/posts`, { content: 'A reply.' });
  expect(replied.status).toBe(201);
  expectDocumented('create-post', replied.body.data);
  const posts = await call('GET', `/threads/${threadId}/posts`);
  expect(posts.body.data.posts.map((p: { content: string }) => p.content)).toEqual([
    'First post from the API.\n\nSecond paragraph.',
    'A reply.',
  ]);
  expectDocumented('list-posts', posts.body.data);
  const threads = await call('GET', `/communities/${slug}/threads?channel=${forum.id}`);
  expect(threads.body.data.threads.map((t: { id: string }) => t.id)).toContain(threadId);
  expectDocumented('list-threads', threads.body.data);
  expect(
    (
      await call('POST', `/communities/${slug}/threads`, {
        channelId: chat.id,
        title: 'No',
        content: 'x',
      })
    ).status,
  ).toBe(422);

  // The wiki (every community starts with a page).
  const wiki = await call('GET', `/communities/${slug}/wiki`);
  expectDocumented('list-wiki-pages', wiki.body.data);
  const firstPage = wiki.body.data.pages[0];
  expect(firstPage).toBeTruthy();
  const wikiPage = await call('GET', `/communities/${slug}/wiki/${firstPage.slug}`);
  expect(typeof wikiPage.body.data.content).toBe('string');
  expectDocumented('get-wiki-page', wikiPage.body.data);

  // Events: list, read, answer, take it back.
  const events = await call('GET', `/communities/${slug}/events`);
  expectDocumented('list-events', events.body.data);
  const eventId = events.body.data.events[0].id;
  const event = await call('GET', `/events/${eventId}`);
  expect(event.body.data).toMatchObject({ title: 'Raid night', going: 0, you: { rsvp: null } });
  expectDocumented('get-event', event.body.data);
  const going = await call('PUT', `/events/${eventId}/rsvp`, { status: 'going' });
  expect(going.body.data).toMatchObject({ going: 1, you: 'going' });
  expectDocumented('rsvp-event', going.body.data);
  expect((await call('GET', `/events/${eventId}`)).body.data.you.rsvp).toBe('going');
  expect((await call('PUT', `/events/${eventId}/rsvp`, { status: null })).body.data.going).toBe(0);
  expect((await call('PUT', `/events/${eventId}/rsvp`, { status: 'sure' })).status).toBe(422);
  expect((await call('GET', '/events/00000000-0000-4000-8000-000000000000')).status).toBe(404);

  // Game servers.
  const browse = await call('GET', '/servers?sort=new');
  expect(browse.status).toBe(200);
  expect(Object.keys(browse.body.data).sort()).toEqual(['page', 'pageSize', 'servers', 'total']);
  expect((await call('GET', `/communities/${slug}/servers`)).body.data).toEqual({ servers: [] });
  expect(
    (await call('GET', '/servers/00000000-0000-4000-8000-000000000000/history?range=7d')).status,
  ).toBe(404);

  // The OpenAPI description needs no token.
  const spec = await page.request.get('/api/v1/openapi.json');
  expect(spec.ok()).toBe(true);
  const doc = (await spec.json()) as { openapi: string; paths: Record<string, unknown> };
  expect(doc.openapi).toBe('3.1.0');
  expect(Object.keys(doc.paths)).toContain('/messages/{id}/reactions/{emoji}');
});

test('the developer docs', async ({ page }) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: 'Developers', level: 1 })).toBeVisible();
  // Every endpoint has its own section, with samples to copy.
  for (const e of ENDPOINTS) {
    await expect(
      page.getByRole('heading', { level: 3, name: e.title, exact: true }),
    ).toBeAttached();
  }
  const send = page.getByRole('article', { name: 'Send a message' });
  await expect(send.getByText('POST', { exact: true })).toBeVisible();
  await expect(send.getByRole('tab', { name: 'curl' })).toHaveAttribute('aria-selected', 'true');
  // Picking a language switches every sample on the page.
  await send.getByRole('tab', { name: 'Python' }).click();
  await expect(send.getByText('requests.post(')).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Edit a message' }).getByText('requests.patch('),
  ).toBeAttached();
  for (const [scheme, contrast] of [
    ['light', 'normal'],
    ['dark', 'normal'],
    ['light', 'high'],
    ['dark', 'high'],
  ] as const) {
    await setScheme(page, scheme, contrast);
    await expectAccessible(page, `developer docs (${scheme}, ${contrast} contrast)`);
  }
  // The sidebar jumps to an endpoint.
  await page
    .getByRole('navigation', { name: 'Developer docs' })
    .getByRole('link', { name: /Answer an event/ })
    .click();
  await expect(page).toHaveURL(/#rsvp-event$/);
});
