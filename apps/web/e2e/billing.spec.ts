import { expect, test } from '@playwright/test';
import {
  createCommunity,
  expectAccessible,
  FIXTURE_CTL,
  joinAsMember,
  signUp,
  uniqueUser,
} from './helpers';

// Stripe is played by the fixture server (apps/worker/src/fixtures/fake-stripe.ts), which has a
// Checkout page, a billing portal and sends signed webhooks back like Stripe does.

test('buy a plan in the store, change it, cancel it and let it end', async ({ page, browser }) => {
  await signUp(page, uniqueUser('buyer'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });

  // The store lists the plans with Stripe's prices.
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'Level up your community' })).toBeVisible();
  const plus = page.getByRole('region', { name: 'Plus' });
  await expect(plus.getByText('$4.99')).toBeVisible();
  await page.getByRole('radio', { name: /Yearly/ }).click();
  await expect(plus.getByText('$49.90')).toBeVisible();
  await page.getByRole('radio', { name: 'Monthly' }).click();
  await expect(page.getByRole('table', { name: 'Compare plans' })).toBeVisible();
  await expectAccessible(page, 'store');

  // Checkout for the community, then back to its Plan & billing page.
  await plus.getByRole('button', { name: 'Get Plus' }).click();
  const dialog = page.getByRole('dialog', { name: 'Get Plus' });
  await expect(dialog.getByLabel('Community')).toContainText('E2E');
  await dialog.getByRole('button', { name: 'Continue to checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture Checkout' })).toBeVisible();
  await page.getByRole('button', { name: 'Pay $4.99' }).click();
  await page.waitForURL(new RegExp(`/c/${slug}/settings/billing`));
  await expect(page.getByText('Thanks! Plus is now on.')).toBeVisible();
  const current = page.getByRole('region', { name: 'Current plan' });
  await expect(current.getByText('Plus', { exact: true })).toBeVisible();
  await expect(current.getByText(/Renews on/)).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Linked game servers' })).toHaveAttribute(
    'aria-valuemax',
    '50',
  );
  await expectAccessible(page, 'plan & billing');

  // The community shows its plan.
  await page.goto(`/c/${slug}`);
  await expect(
    page.getByRole('list', { name: 'Community details' }).getByText('Plus'),
  ).toBeVisible();

  // Switch to Pro, billed yearly.
  await page.goto(`/c/${slug}/settings/billing`);
  const manage = page.getByRole('region', { name: 'Manage plan' });
  await manage.getByRole('radio', { name: /Yearly/ }).click();
  await manage.getByRole('button', { name: /Switch to Pro/ }).click();
  await expect(page.getByText('Switched to Pro.')).toBeVisible();
  await expect(current.getByText('Pro', { exact: true })).toBeVisible();
  await expect(current.getByText(/\$99\.90 \/year/)).toBeVisible();

  // Cancel at the end of the period, then change our mind.
  page.once('dialog', (d) => void d.accept());
  await manage.getByRole('button', { name: 'Cancel plan' }).click();
  await expect(current.getByText(/Ends on .* and won't renew/)).toBeVisible();
  await manage.getByRole('button', { name: 'Keep the plan' }).click();
  await expect(current.getByText(/Renews on/)).toBeVisible();

  // Other managers see who pays; members can't open billing at all.
  const member = await joinAsMember(browser, slug, 'nobill');
  const res = await member.page.goto(`/c/${slug}/settings/billing`);
  expect(res?.status()).toBe(404);
  await member.context.close();

  // Cancelling in Stripe's billing portal ends the plan (via the webhook).
  await manage.getByRole('button', { name: /Payment details and invoices/ }).click();
  await expect(page.getByRole('heading', { name: 'Fixture billing portal' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  await page.waitForURL(new RegExp(`/c/${slug}/settings/billing`));
  await expect(current.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Upgrade' })).toBeVisible();
});

test('webhooks must be signed by Stripe', async ({ request }) => {
  const res = await request.post('/api/stripe/webhook', {
    headers: { 'stripe-signature': 't=1,v1=forged' },
    data: { id: 'evt_forged', type: 'customer.subscription.updated', data: { object: {} } },
  });
  expect(res.status()).toBe(400);
  const state = await request.get(`${FIXTURE_CTL}/stripe/state`);
  expect(state.ok()).toBe(true);
});

test('signed-out visitors can browse the store', async ({ page }) => {
  await page.goto('/store');
  await expect(
    page.getByRole('region', { name: 'Pro' }).getByRole('link', { name: 'Sign in to buy' }),
  ).toHaveAttribute('href', '/sign-in?next=/store');
  await expectAccessible(page, 'store signed out');
});
