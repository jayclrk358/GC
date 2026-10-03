// Real browsers alongside the load: a few people using the actual web app (Chrome, headless) while
// `load` keeps the servers busy, to see what the load feels like from the other side of the screen.
// They share one chat, take turns to send messages through the composer, and time how long each
// one takes to show up for everyone else. Page errors, failed requests and server errors are
// counted.
//
//   pnpm --filter @gamecentral/loadtest browsers --browsers 4 --secs 300
//
// Like `load`: a test or staging copy only (--base), never a live site.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { arg, DATA_DIR, rng, Series, sleep, type SetupData } from './common';

const BASE = arg('base', 'http://localhost:3000');
const BROWSERS = Number(arg('browsers', '4'));
const SECS = Number(arg('secs', '300'));

const setup = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'setup.json'), 'utf8')) as SetupData;
const random = rng(11);

// Everyone in one chat: the first community, and its first text channel.
const community = setup.communities[0]!;
const channel = community.channels[0]!;
// From the far end of the list, away from most of the virtual people.
const users = community.members
  .map((id) => setup.users.find((u) => u.id === id)!)
  .reverse()
  .slice(0, BROWSERS);

const stats = new Map<string, Series>();
const stat = (label: string) => {
  let s = stats.get(label);
  if (!s) stats.set(label, (s = new Series()));
  return s;
};
const problems = new Map<string, number>();
const problem = (what: string) => problems.set(what, (problems.get(what) ?? 0) + 1);

const composer = (page: Page) => page.getByRole('textbox', { name: `Message #${channel.name}` });
const message = (page: Page, text: string): Locator =>
  page.locator('article[data-message-id]').filter({ hasText: text });

const manifest = JSON.parse(
  fs.readFileSync(
    arg(
      'manifest',
      path.resolve(DATA_DIR, '../../web/.next/server/server-reference-manifest.json'),
    ),
    'utf8',
  ),
) as { node: Record<string, { exportedName: string }> };
const ackAction = Object.entries(manifest.node).find(
  ([, v]) => v.exportedName === 'ackChannelAction',
)?.[0];

/**
 * Mark the chat read up to now first. Someone with unread messages lands at the "New messages"
 * line with newer ones below, and new messages then wait under a "new messages" button instead
 * of joining the list, which is right for them but not what this measures.
 */
async function markRead(page: Page) {
  const res = await page.request.get(
    `/api/communities/${community.id}/chat/${channel.id}/messages`,
  );
  const latest = ((await res.json()) as { messages?: { id: string }[] }).messages?.at(-1)?.id;
  if (!latest || !ackAction) return;
  await page.request.post(`/c/${community.slug}/chat/${channel.name}`, {
    headers: {
      'next-action': ackAction,
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      origin: BASE,
    },
    data: JSON.stringify([community.id, channel.id, latest]),
  });
}

async function timed<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  const t0 = performance.now();
  try {
    const out = await work();
    stat(label).record(performance.now() - t0, true);
    return out;
  } catch (err) {
    const reason = (err as Error).message.split('\n')[0]!.slice(0, 80);
    stat(label).record(performance.now() - t0, false, reason);
    return null;
  }
}

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
const host = new URL(BASE).hostname;
const pages: { page: Page; name: string }[] = [];

for (const user of users) {
  const context = await browser.newContext({
    baseURL: BASE,
    storageState: {
      cookies: [
        {
          name: 'mx-cookies',
          value: '1.necessary',
          domain: host,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => problem(`page error: ${err.message.slice(0, 100)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problem(`console: ${msg.text().slice(0, 100)}`);
  });
  page.on('requestfailed', (req) => {
    const why = req.failure()?.errorText ?? 'failed';
    // Leaving a page cancels what it was still loading; that's not a failure.
    if (why !== 'net::ERR_ABORTED') problem(`request failed: ${why}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) problem(`server error ${res.status()} ${new URL(res.url()).pathname}`);
  });
  const signedIn = await timed('sign in', async () => {
    const res = await page.request.post('/api/auth/sign-in/email', {
      data: { email: user.email, password: setup.password, rememberMe: true },
      headers: { origin: BASE },
    });
    if (!res.ok()) throw new Error(`sign in ${res.status()}`);
  });
  if (signedIn === null) continue;
  const opened = await timed('open chat', async () => {
    await markRead(page);
    await page.goto(`/c/${community.slug}/chat/${channel.name}`);
    await composer(page).waitFor({ state: 'visible', timeout: 30_000 });
  });
  if (opened === null) continue;
  pages.push({ page, name: user.name });
}

console.log(`${pages.length} of ${users.length} browsers in #${channel.name} of ${community.slug}`);
// Give the live connections a moment to subscribe.
await sleep(2000);

const started = Date.now();
let turn = 0;
let shot = '';
while (Date.now() - started < SECS * 1000 && pages.length) {
  const sender = pages[turn++ % pages.length]!;
  const text = `browser check ${turn} ${Date.now()}`;
  const sent = await timed('send (until shown as sent)', async () => {
    const box = composer(sender.page);
    await box.click();
    await box.fill(text);
    await box.press('Enter');
    await message(sender.page, text).waitFor({ state: 'visible', timeout: 15_000 });
    await message(sender.page, text)
      .getByText('Sending…')
      .waitFor({ state: 'hidden', timeout: 30_000 });
  });
  if (sent !== null) {
    // Everyone else should see it without doing anything.
    await Promise.all(
      pages
        .filter((p) => p !== sender)
        .map(async (p) => {
          const seen = await timed('seen by the others', () =>
            message(p.page, text).waitFor({ state: 'visible', timeout: 20_000 }),
          );
          if (seen === null && !shot) {
            shot = path.join(DATA_DIR, `not-seen-${Date.now()}.png`);
            await p.page.screenshot({ path: shot }).catch(() => null);
            console.log(`A message didn't show up for ${p.name}: ${shot}`);
          }
        }),
    );
  }
  // Now and then, someone looks around and comes back (a full page load).
  if (random() < 0.2) {
    const wanderer = pages[Math.floor(random() * pages.length)]!;
    await timed('page: explore', async () => {
      await wanderer.page.goto('/explore');
      await wanderer.page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30_000 });
    });
    await timed('open chat', async () => {
      await markRead(wanderer.page);
      await wanderer.page.goto(`/c/${community.slug}/chat/${channel.name}`);
      await composer(wanderer.page).waitFor({ state: 'visible', timeout: 30_000 });
    });
    await sleep(1500);
  }
  await sleep(3000 + random() * 4000);
}

const rows = Object.fromEntries([...stats.entries()].map(([k, s]) => [k, s.summary()]));
console.table(
  Object.entries(rows).map(([what, r]) => ({
    what,
    count: r.count,
    failed: r.failed,
    p50: r.p50,
    p95: r.p95,
    max: r.max,
  })),
);
for (const [what, r] of Object.entries(rows)) {
  if (r.failed) console.log(`  ${what} failures:`, r.reasons);
}
console.log(
  problems.size
    ? 'Problems seen in the browsers:'
    : 'No page errors, failed requests or server errors.',
);
for (const [what, n] of [...problems.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} × ${what}`);
}
fs.mkdirSync(DATA_DIR, { recursive: true });
const file = path.join(DATA_DIR, `browsers-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(
  file,
  JSON.stringify({ base: BASE, rows, problems: Object.fromEntries(problems) }, null, 2),
);
console.log(`Report: ${file}`);
await browser.close();
process.exit(0);
