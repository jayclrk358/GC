import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  setScheme,
  signIn,
  signUp,
  uniqueUser,
} from './helpers';

/** Seeded demo account with a verified email (pnpm db:seed). */
const VOTER = { login: 'carol', password: 'magnox-demo-1234' };

async function addFixtureServer(page: Page, slug: string, name: string, tags = '') {
  await page.goto(`/c/${slug}/settings/servers`);
  await page.getByRole('button', { name: 'Add server' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a game server' });
  await dialog.getByLabel('Display name').fill(name);
  await dialog.getByLabel('Address').fill('127.0.0.1');
  await dialog.getByLabel('Port').fill('25590');
  if (tags) await dialog.getByLabel('Tags').fill(tags);
  await dialog.getByRole('button', { name: 'Add server' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText(/Online · \d+\/120/, { timeout: 20_000 });
  return row;
}

async function fixtureVotes(request: APIRequestContext): Promise<{ username: string }[]> {
  return ((await (await request.get(`${FIXTURE_CTL}/votes`)).json()) as { votes: [] }).votes;
}

test.describe('game servers', () => {
  test('browser filters, history charts, voting and Votifier rewards', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    await request.post(`${FIXTURE_CTL}/minecraft`, {
      data: { motd: 'Fixture Craft', online: true, players: 17, max: 120 },
    });
    await signUp(page, uniqueUser('vote'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    const name = `Vote Arena ${Date.now().toString(36)}`;
    const row = await addFixtureServer(page, slug, name, 'arena, pvp');

    // Verify ownership so it's listed in the browser.
    const token = (await row.locator('code').innerText()).trim();
    await request.post(`${FIXTURE_CTL}/minecraft`, { data: { motd: `Fixture Craft ${token}` } });
    await row.getByRole('button', { name: /Check now/ }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('Verified', {
        timeout: 2_000,
      });
    }).toPass({ timeout: 60_000 });

    // Votifier: save the details, then check them with a test vote.
    const settingsRow = page.getByRole('listitem').filter({ hasText: name });
    await settingsRow.getByRole('button', { name: /Alerts & votes/ }).click();
    const dialog = page.getByRole('dialog', { name: `Alerts and votes for ${name}` });
    await dialog.getByLabel('Votifier host').fill('127.0.0.1');
    await dialog.getByLabel('Port').fill('25592');
    await dialog.getByLabel('Token').fill('fixture-token');
    await expectAccessible(page, 'server integrations');
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toBeHidden();
    await settingsRow.getByRole('button', { name: /Alerts & votes/ }).click();
    // The token never comes back to the browser; the form only says one is saved.
    await expect(dialog.getByLabel('Token')).toHaveValue('');
    await expect(dialog.getByText(/Saved\. Leave blank to keep it/)).toBeVisible();
    await dialog.getByLabel('Minecraft username').fill('TestSteve');
    await dialog.getByRole('button', { name: 'Send test vote' }).click();
    await expect(page.getByText('Test vote delivered.')).toBeVisible();
    expect((await fixtureVotes(request)).map((v) => v.username)).toContain('TestSteve');
    await page.keyboard.press('Escape');

    // Browser: search, a tag filter and a filter that excludes it.
    await page.goto(`/servers?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole('status').filter({ hasText: /server/ })).toHaveText('1 server');
    await page
      .getByRole('article')
      .filter({ hasText: name })
      .getByRole('link', { name: '#pvp' })
      .click();
    await expect(page).toHaveURL(/tag=pvp/);
    await expect(page.getByRole('article').filter({ hasText: name })).toBeVisible();
    await expectAccessible(page, 'server browser');
    await page.goto(`/servers?q=${encodeURIComponent(name)}&minPlayers=500`);
    await expect(page.getByRole('status').filter({ hasText: /server/ })).toHaveText(
      'No servers found',
    );
    await page.goto(`/servers?q=${encodeURIComponent(name)}&online=1`);
    await page.getByRole('article').filter({ hasText: name }).getByRole('link', { name }).click();

    // Server page: live status, charts with keyboard read-out, and a table view.
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('Players online', { exact: true })).toBeVisible();
    const chart = page.getByRole('group', { name: /Players online over the last 24 hours/ });
    await chart.focus();
    await expect(chart.locator('[aria-live="polite"]')).toContainText(/Uptime [\d.]+%/);
    await page.getByText('Show as a table').click();
    await expect(page.getByRole('table', { name: /Players and uptime/ })).toBeVisible();
    await page.getByText('7 days', { exact: true }).click();
    await expect(page.getByRole('radio', { name: '7 days' })).toBeChecked();
    await expect(
      page.getByRole('group', { name: /Players online over the last 7 days/ }),
    ).toBeVisible();
    for (const [scheme, contrast] of [
      ['light', 'normal'],
      ['dark', 'normal'],
      ['dark', 'high'],
    ] as const) {
      await setScheme(page, scheme, contrast);
      await expectAccessible(page, `server page ${scheme}/${contrast}`);
    }
    // The owner signed up moments ago and hasn't confirmed their email.
    await expect(page.getByText('Verify your email address to vote.')).toBeVisible();

    // A verified player votes and gets a reward in game; a second vote waits a day.
    const context = await browser.newContext();
    const voter = await context.newPage();
    await signIn(voter, VOTER.login, VOTER.password);
    await voter.goto(page.url());
    await voter.getByLabel('Minecraft username').fill('CarolCrafts');
    await voter.getByRole('button', { name: 'Vote for this server' }).click();
    await expect(voter.getByText('Vote counted! Your reward is on its way.')).toBeVisible();
    await expect(voter.getByRole('status').filter({ hasText: 'Thanks for voting!' })).toBeVisible();
    await expect
      .poll(async () => (await fixtureVotes(request)).map((v) => v.username), { timeout: 20_000 })
      .toContain('CarolCrafts');
    await voter.reload();
    await expect(
      voter.getByText(/You've already voted\. You can vote again in (1 day|2[34] h)/),
    ).toBeVisible();
    await expect(voter.getByText('Votes this month').locator('..')).toContainText('1');
    await context.close();
  });

  test('down and back-up alerts are posted in chat', async ({ page, request }) => {
    test.setTimeout(240_000);
    await request.post(`${FIXTURE_CTL}/minecraft`, { data: { online: true, players: 5 } });
    try {
      await signUp(page, uniqueUser('alert'), '/new');
      const { slug } = await createCommunity(page, { template: 'Game server' });
      const name = `Alerted ${Date.now().toString(36)}`;
      const row = await addFixtureServer(page, slug, name);

      await row.getByRole('button', { name: /Alerts & votes/ }).click();
      const dialog = page.getByRole('dialog', { name: `Alerts and votes for ${name}` });
      await dialog.getByLabel('Alert channel').selectOption({ label: '#lounge' });
      await dialog.getByRole('button', { name: 'Save settings' }).click();
      await expect(dialog).toBeHidden();

      const chat = await page.context().newPage();
      await chat.goto(`/c/${slug}/chat/lounge`);
      const notice = (kind: string) =>
        chat.locator(`article[data-kind="${kind}"]`).filter({ hasText: name });

      // "Down" needs a few failed checks in a row; each manual check runs at most every 30 s.
      await request.post(`${FIXTURE_CTL}/minecraft`, { data: { online: false } });
      await expect(async () => {
        await row.getByRole('button', { name: /Check now/ }).click();
        await expect(notice('server_down')).toBeVisible({ timeout: 35_000 });
      }).toPass({ timeout: 180_000 });
      await expect(notice('server_down')).toContainText(`${name} is down.`);
      await expect(notice('server_down').getByRole('link', { name: 'View server' })).toBeVisible();

      await request.post(`${FIXTURE_CTL}/minecraft`, { data: { online: true } });
      await expect(async () => {
        await row.getByRole('button', { name: /Check now/ }).click();
        await expect(notice('server_up')).toBeVisible({ timeout: 35_000 });
      }).toPass({ timeout: 90_000 });
      await expect(notice('server_up')).toContainText(`${name} is back up after`);
      await expectAccessible(chat, 'chat with server notices');
    } finally {
      await request.post(`${FIXTURE_CTL}/minecraft`, { data: { online: true } });
    }
  });
});
