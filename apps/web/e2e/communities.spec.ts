import { expect, test } from '@playwright/test';
import { createCommunity, expectAccessible, FIXTURE_CTL, signUp, uniqueUser } from './helpers';

test.describe('community hubs', () => {
  test('create a community with the wizard', async ({ page }) => {
    await signUp(page, uniqueUser('owner'), '/new');
    const { name, slug } = await createCommunity(page, { template: 'Game server', preset: 'Ocean' });
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Your community is ready!' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Server rules' })).toBeVisible();
    await expectAccessible(page, 'community home');
    for (const path of ['members', 'servers']) {
      await page.goto(`/c/${slug}/${path}`);
      await expectAccessible(page, `community ${path}`);
    }
  });

  test('theme editor blocks low-contrast colours and suggests fixes', async ({ page }) => {
    await signUp(page, uniqueUser('theme'), '/new');
    const { slug } = await createCommunity(page);
    await page.goto(`/c/${slug}/settings/appearance`);
    await expectAccessible(page, 'appearance settings');

    await page.getByLabel('Hex value for Main text').fill('#bbbbbb');
    const status = page.locator('#contrast-h ~ p[role="status"]');
    await expect(status).toContainText(/need more contrast/);
    await expect(page.getByRole('button', { name: 'Save theme' })).toBeDisabled();

    await page.getByRole('button', { name: 'Fix all automatically' }).click();
    await expect(status).toHaveText('All colour pairs meet WCAG AA.');
    await page.getByRole('button', { name: 'Arcade' }).click();
    await page.getByRole('button', { name: 'Save theme' }).click();
    await expect(page.getByText('Theme saved')).toBeVisible();

    await page.goto(`/c/${slug}`);
    const css = await page.locator('style').evaluateAll((els) => els.map((e) => e.textContent).join(''));
    expect(css).toContain('@layer mx-community');
    expect(css).toContain('#f472ff');
  });

  test('page builder adds, edits and reorders blocks from the keyboard', async ({ page }) => {
    await signUp(page, uniqueUser('builder'), '/new');
    const { slug } = await createCommunity(page, { template: 'Fan hub' });
    await page.goto(`/c/${slug}/settings/page`);
    await expectAccessible(page, 'page builder');

    await page.getByRole('button', { name: 'Add block' }).click();
    await page.getByRole('menuitem', { name: /^FAQ/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit FAQ block' });
    await dialog.getByRole('button', { name: 'Add item' }).click();
    await dialog.getByLabel('Question').fill('Is it free?');
    await dialog.getByLabel('Answer').fill('Yes, always.');
    await expectAccessible(page, 'block editor dialog');
    await dialog.getByRole('button', { name: 'Save block' }).click();
    await expect(dialog).toBeHidden();

    // Keyboard drag: pick up the FAQ handle, move it to the top, drop it.
    const handle = page.getByRole('button', { name: 'Drag to reorder FAQ' });
    await handle.focus();
    await page.keyboard.press('Space');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    const first = page.getByRole('list', { name: 'Page blocks' }).getByRole('listitem').first();
    await expect(first).toContainText('FAQ');

    // Move buttons are an alternative to dragging.
    await page.getByRole('button', { name: 'Move FAQ down' }).click();
    await expect(page.getByRole('list', { name: 'Page blocks' }).getByRole('listitem').nth(1)).toContainText('FAQ');

    await page.reload();
    await expect(page.getByRole('list', { name: 'Page blocks' }).getByRole('listitem').nth(1)).toContainText('FAQ');
    await page.goto(`/c/${slug}`);
    await page.getByText('Is it free?').click();
    await expect(page.getByText('Yes, always.')).toBeVisible();
  });

  test('link a game server, see live status and verify ownership', async ({ page, request }) => {
    await request.post(`${FIXTURE_CTL}/minecraft`, { data: { motd: 'Fixture Craft', online: true, players: 17, max: 120 } });
    await signUp(page, uniqueUser('srv'), '/new');
    const { slug } = await createCommunity(page, { template: 'Game server' });
    await page.goto(`/c/${slug}/settings/servers`);
    await page.getByRole('button', { name: 'Add server' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a game server' });
    await dialog.getByLabel('Display name').fill('Fixture Survival');
    await dialog.getByLabel('Address').fill('127.0.0.1');
    await dialog.getByLabel('Port').fill('25590');
    await dialog.getByRole('button', { name: 'Add server' }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('listitem').filter({ hasText: 'Fixture Survival' });
    await expect(row).toContainText('Online · 17/120', { timeout: 20_000 });
    await expect(row).toContainText('Not verified');
    const token = (await row.locator('code').innerText()).trim();
    expect(token).toMatch(/^mx-/);
    await expectAccessible(page, 'server settings');

    // Put the token in the MOTD, then ask for a re-check.
    await request.post(`${FIXTURE_CTL}/minecraft`, { data: { motd: `Fixture Craft ${token}`, players: 21 } });
    await page.waitForTimeout(31_000); // manual refreshes within 30 s reuse the cached result
    await row.getByRole('button', { name: /Check now/ }).click();
    await expect(row).toContainText('Online · 21/120', { timeout: 20_000 });
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'Fixture Survival' })).toContainText('Verified');

    // Public server card updates live over the socket.
    await page.goto(`/c/${slug}/servers`);
    const card = page.getByRole('article').filter({ hasText: 'Fixture Survival' });
    await expect(card).toContainText('21 / 120');
  });

  test('private community: invite link lets a second user join', async ({ page, browser }) => {
    await signUp(page, uniqueUser('host'), '/new');
    const { name, slug } = await createCommunity(page, { inviteOnly: true });
    await page.getByRole('button', { name: 'Invite' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite people' });
    await dialog.getByRole('button', { name: 'Create invite link' }).click();
    const link = await dialog.getByLabel('Invite link').inputValue();
    expect(link).toMatch(/\/invite\/[a-z0-9]+$/);

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(link);
    await expect(guest.getByRole('heading', { name })).toBeVisible();
    await expectAccessible(guest, 'invite page');
    await guest.getByRole('link', { name: 'Sign up to join' }).click();
    const guestUser = uniqueUser('guest');
    await guest.getByLabel('Display name').fill(guestUser.name);
    await guest.getByLabel('Username').fill(guestUser.username);
    await guest.getByLabel('Email').fill(guestUser.email);
    await guest.getByLabel('Password').fill(guestUser.password);
    await guest.getByRole('button', { name: 'Create account' }).click();
    await guest.getByRole('button', { name: 'Accept invite' }).click();
    await guest.waitForURL(new RegExp(`/c/${slug}$`));
    await expect(guest.getByRole('button', { name: /Joined/ })).toBeVisible();

    await page.goto(`/c/${slug}/members`);
    await expect(page.getByText(`@${guestUser.username}`)).toBeVisible();
    await guestContext.close();
  });

  test('roles: create a role, grant a permission and assign it', async ({ page, browser }) => {
    await signUp(page, uniqueUser('roles'), '/new');
    const { slug } = await createCommunity(page);
    const member = uniqueUser('member');
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await signUp(memberPage, member, `/c/${slug}`);
    await memberPage.goto(`/c/${slug}`);
    await memberPage.getByRole('button', { name: 'Join community' }).first().click();
    await expect(memberPage.getByRole('button', { name: /Joined/ })).toBeVisible();

    await page.goto(`/c/${slug}/settings/roles`);
    await expectAccessible(page, 'roles settings');
    await page.getByRole('button', { name: 'Create role' }).click();
    await page.getByRole('button', { name: 'New role' }).click();
    await page.getByLabel('Role name').fill('Event Host');
    await page.getByRole('switch', { name: 'Manage events' }).click();
    await page.getByRole('button', { name: 'Save role' }).click();
    await expect(page.getByText('Role saved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Event Host' })).toBeVisible();

    await page.goto(`/c/${slug}/settings/members`);
    await page.getByRole('button', { name: `Roles ${member.name}` }).click();
    const dialog = page.getByRole('dialog', { name: `Roles for ${member.name}` });
    await dialog.getByRole('checkbox', { name: /Event Host/ }).check();
    await expect(dialog.getByRole('checkbox', { name: /Event Host/ })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('list', { name: `Roles of ${member.name}` })).toContainText('Event Host');
    await memberContext.close();
  });

  test('explore finds public communities and profiles render', async ({ page }) => {
    const user = await signUp(page, uniqueUser('explorer'), '/new');
    const { name } = await createCommunity(page, { name: `Findable ${Date.now().toString(36)}` });
    await page.goto('/explore');
    await expectAccessible(page, 'explore');
    await page.getByLabel('Search').fill(name);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name })).toBeVisible();

    await page.goto('/settings/profile');
    await page.getByLabel('Bio').fill('I build castles.');
    await page.getByLabel('Pronouns').fill('they/them');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
    await page.goto(`/u/${user.username}`);
    await expect(page.getByText('I build castles.')).toBeVisible();
    await expect(page.getByRole('link', { name })).toBeVisible();
    await expectAccessible(page, 'profile page');
  });
});

