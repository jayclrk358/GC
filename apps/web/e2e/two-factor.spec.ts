import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, grantAdmin, PASSWORD, signUp, uniqueUser } from './helpers';

/** What an authenticator app shows for a setup key right now (RFC 6238: SHA-1, 6 digits, 30s). */
function totp(base32Key: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32Key.replace(/[\s=]/g, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, '0');
}

async function signOut(page: Page, name: string) {
  await page.getByRole('button', { name: `Account menu for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

async function passwordStep(page: Page, identifier: string) {
  await page.goto('/sign-in?next=/settings/security');
  await page.getByLabel('Email or username').fill(identifier);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/sign-in\/two-factor\?next=%2Fsettings%2Fsecurity/);
}

test('turn on two-factor, sign in with a code or a backup code, then turn it off', async ({
  page,
}) => {
  const user = await signUp(page, uniqueUser('twofa'));
  await page.goto('/settings/security');
  const section = page.getByRole('region', { name: 'Two-factor authentication' });
  await expect(section.getByText('Off', { exact: true })).toBeVisible();
  await expectAccessible(page, 'security settings, two-factor off');

  // Set up: scan (or type the key), then the code.
  await section.getByLabel('Confirm your password').fill(PASSWORD);
  await section.getByRole('button', { name: 'Set up two-factor' }).click();
  await expect(section.getByRole('heading', { name: 'Scan this QR code' })).toBeVisible();
  await expect(section.getByRole('img', { name: /QR code that adds Game Central/ })).toBeVisible();
  await section.getByText('Can’t scan it? Type in this key instead').click();
  const key = (await section.locator('code').innerText()).replace(/\s/g, '');
  expect(key).toMatch(/^[A-Z2-7]{32,}$/);
  await expectAccessible(page, 'two-factor setup');

  await section.getByLabel('Code from the app').fill('000000');
  await section.getByRole('button', { name: 'Turn on two-factor' }).click();
  await expect(section.getByText('That code isn’t right.')).toBeVisible();
  await section.getByLabel('Code from the app').fill(totp(key));
  await section.getByRole('button', { name: 'Turn on two-factor' }).click();

  // Backup codes, shown once.
  await expect(section.getByText('Two-factor authentication is on')).toBeVisible();
  const list = section.getByRole('list', { name: 'Save your backup codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const codes = await list.getByRole('listitem').allInnerTexts();
  await expect(section.getByRole('heading', { name: 'Save your backup codes' })).toBeFocused();
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('game-central-backup-codes.txt');
  await expectAccessible(page, 'backup codes');
  await section.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(section.getByText('On', { exact: true })).toBeVisible();
  await expect(section.getByText('10 backup codes left')).toBeVisible();

  // Signing in now asks for the code.
  await signOut(page, user.name);
  await passwordStep(page, user.username);
  await expect(page.getByRole('heading', { name: 'Two-factor verification' })).toBeVisible();
  await expectAccessible(page, 'two-factor sign-in');
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code isn’t right.')).toBeVisible();
  await page.getByLabel('Verification code').fill(totp(key));
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL('**/settings/security');
  await expect(page.getByRole('button', { name: `Account menu for ${user.name}` })).toBeVisible();

  // Or a backup code instead, once.
  await signOut(page, user.name);
  await passwordStep(page, user.email);
  await page.getByRole('button', { name: 'Use a backup code instead' }).click();
  await page.getByLabel('Backup code').fill(codes[0]!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL('**/settings/security');
  await expect(section.getByText('9 backup codes left')).toBeVisible();

  // New backup codes replace the old ones.
  await section.getByRole('button', { name: 'Make new backup codes' }).click();
  await section.getByLabel('Confirm your password').fill(PASSWORD);
  await section.getByRole('button', { name: 'Make new codes' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const fresh = await list.getByRole('listitem').allInnerTexts();
  expect(fresh).not.toContain(codes[1]);
  await section.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(section.getByText('10 backup codes left')).toBeVisible();

  // Turning it off needs the password.
  await section.getByRole('button', { name: 'Turn off two-factor' }).click();
  await section.getByLabel('Confirm your password').fill('not-my-password');
  await section.getByRole('button', { name: 'Turn off', exact: true }).click();
  await expect(section.getByText('That password isn’t right.')).toBeVisible();
  await section.getByLabel('Confirm your password').fill(PASSWORD);
  await section.getByRole('button', { name: 'Turn off', exact: true }).click();
  await expect(section.getByText('Off', { exact: true })).toBeVisible();

  // And sign-in is back to just the password.
  await signOut(page, user.name);
  await page.goto('/sign-in');
  await page.getByLabel('Email or username').fill(user.username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: `Account menu for ${user.name}` })).toBeVisible();
});

test('staff can turn off two-factor for someone who has lost their phone', async ({
  page,
  browser,
}) => {
  const user = await signUp(page, uniqueUser('lostphone'));
  await page.goto('/settings/security');
  const section = page.getByRole('region', { name: 'Two-factor authentication' });
  await section.getByLabel('Confirm your password').fill(PASSWORD);
  await section.getByRole('button', { name: 'Set up two-factor' }).click();
  await section.getByText('Can’t scan it? Type in this key instead').click();
  const key = (await section.locator('code').innerText()).replace(/\s/g, '');
  await section.getByLabel('Code from the app').fill(totp(key));
  await section.getByRole('button', { name: 'Turn on two-factor' }).click();
  await section.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(section.getByText('On', { exact: true })).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  const admin = uniqueUser('staff');
  await signUp(staff, admin);
  grantAdmin(admin.email);
  await staff.goto(`/admin/users?q=${encodeURIComponent(user.email)}`);
  await staff.getByRole('link', { name: user.name }).click();
  const reset = staff.getByRole('region', { name: 'Two-factor' });
  await reset.getByRole('button', { name: 'Reset two-factor' }).click();
  await reset.getByRole('button', { name: 'Yes, turn it off' }).click();
  await expect(staff.getByText('Two-factor turned off')).toBeVisible();
  await expect(reset).toBeHidden();

  // They're signed out everywhere, and sign back in with just their password.
  await page.goto('/settings/security');
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel('Email or username').fill(user.username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/settings/security');
  await expect(section.getByText('Off', { exact: true })).toBeVisible();
});
