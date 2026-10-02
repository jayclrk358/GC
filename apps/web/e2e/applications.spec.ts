import { expect, test } from '@playwright/test';
import { choose, createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

test('applications: write the questions, apply, get accepted and go through the welcome steps', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signUp(page, uniqueUser('apps'), '/new');
  const { slug, name } = await createCommunity(page, { template: 'Game server', apply: true });
  const base = `/c/${slug}/settings`;

  // A role people can give themselves, to pick in the welcome steps.
  await page.goto(`${base}/roles`);
  await page.getByRole('button', { name: 'Create role' }).click();
  await page.getByRole('button', { name: 'New role', exact: true }).click();
  await page.getByLabel('Role name').fill('Healer');
  const selfAssignable = page.getByRole('switch', { name: 'Self-assignable' });
  const kick = page.getByRole('switch', { name: 'Kick members' });
  await selfAssignable.click();
  // Roles members take themselves keep to everyday permissions, and the form says so both ways.
  await expect(kick).toBeDisabled();
  await expect(page.getByText('Not on self-assignable roles.').first()).toBeVisible();
  await selfAssignable.click();
  await kick.click();
  await expect(selfAssignable).toBeDisabled();
  await expect(page.getByText(/^Only for roles with everyday permissions/)).toBeVisible();
  await kick.click();
  await selfAssignable.click();
  await page.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByText('Role saved')).toBeVisible();

  // Welcome steps: a message, two rules, and read-only until they agree.
  await page.goto(`${base}/onboarding`);
  await expect(page.getByText('1 role can be picked.')).toBeVisible();
  await page.getByRole('switch', { name: 'Show welcome steps to new members' }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Glad to have you here!');
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByRole('textbox', { name: 'Rule 1', exact: true }).fill('Be kind.');
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByRole('textbox', { name: 'Rule 2', exact: true }).fill('No cheating.');
  await page.getByRole('button', { name: 'Move rule 2 up' }).click();
  await expect(page.getByRole('textbox', { name: 'Rule 1', exact: true })).toHaveValue(
    'No cheating.',
  );
  await page.getByRole('switch', { name: 'Read-only until they agree' }).click();
  await expectAccessible(page, 'welcome steps settings');
  await page.getByRole('button', { name: 'Save welcome steps' }).click();
  await expect(page.getByText('Welcome steps saved')).toBeVisible();

  // The questions: the default one plus a pick-one.
  await page.goto(`${base}/applications`);
  await expect(page.getByText('No applications waiting. Nice and tidy.')).toBeVisible();
  await expectAccessible(page, 'applications (empty)');
  await page.getByRole('link', { name: 'Edit questions' }).click();
  await expect(page.getByRole('heading', { name: 'Application questions' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Introduction' }).fill('We play twice a week.');
  await page.getByRole('button', { name: 'Add a question' }).click();
  const q2 = page.getByRole('group', { name: 'Question 2' });
  await q2.getByRole('textbox', { name: 'Question', exact: true }).fill('Which region?');
  await choose(q2.getByRole('combobox', { name: 'Answer type' }), 'Pick one');
  // One option isn't enough.
  await q2.getByRole('textbox', { name: 'Options' }).fill('EU');
  await page.getByRole('button', { name: 'Save questions' }).click();
  await expect(q2.getByText('Give at least two options to choose from.')).toBeVisible();
  await q2.getByRole('textbox', { name: 'Options' }).fill('EU\nNA');
  await expectAccessible(page, 'application form editor');
  await page.getByRole('button', { name: 'Save questions' }).click();
  await expect(page.getByText('Questions saved')).toBeVisible();

  // Someone applies.
  const applicant = uniqueUser('applicant');
  const context = await browser.newContext();
  const them = await context.newPage();
  await signUp(them, applicant, `/c/${slug}`);
  await them.goto(`/c/${slug}`);
  await them.getByRole('link', { name: 'Apply to join' }).first().click();
  await expect(them.getByRole('heading', { name: `Apply to join ${name}` })).toBeVisible();
  await expect(them.getByText('We play twice a week.')).toBeVisible();
  await expectAccessible(them, 'apply form');
  await them.getByRole('button', { name: 'Send application' }).click();
  await expect(them.getByText('This question needs an answer.').first()).toBeVisible();
  await them.getByLabel(/Why would you like to join/).fill('I heal a lot.');
  await them.getByRole('radio', { name: 'EU' }).check();
  await them.getByRole('button', { name: 'Send application' }).click();
  await expect(them.getByText('Your application is in')).toBeVisible();
  // Posting needs membership: the chat says so.
  await them.goto(`/c/${slug}/chat/lounge`);
  await expect(them.getByRole('link', { name: 'Apply to join' }).last()).toBeVisible();
  await expect(them.getByRole('textbox', { name: 'Message #lounge' })).toHaveCount(0);

  // The team reads it and lets them in.
  await page.goto(`${base}/applications`);
  await expect(page.getByRole('link', { name: /Applications\s*1/ })).toBeVisible();
  const card = page.getByRole('article', { name: applicant.name });
  await expect(card.getByText('I heal a lot.')).toBeVisible();
  await expect(card.getByText('EU', { exact: true })).toBeVisible();
  await expectAccessible(page, 'application queue');
  await card.getByRole('button', { name: `Accept ${applicant.name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Accept ${applicant.name}?` });
  await dialog.getByRole('textbox', { name: 'Message (optional)' }).fill('Welcome aboard!');
  await dialog.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText(`${applicant.name} is now a member`)).toBeVisible();
  await page.getByRole('link', { name: 'Accepted' }).click();
  await expect(page.getByRole('article', { name: applicant.name })).toContainText(
    'Welcome aboard!',
  );

  // They're a member now, but read-only until they agree to the rules.
  await them.goto(`/c/${slug}/chat/lounge`);
  await expect(
    them.getByText('Agree to the rules in the welcome steps to start posting.'),
  ).toBeVisible();
  await them.getByRole('link', { name: 'Read the rules' }).click();
  await expect(them.getByRole('heading', { name: `Welcome to ${name}` })).toBeVisible();
  await expect(them.getByText('Glad to have you here!')).toBeVisible();
  const rules = them.getByRole('region', { name: 'Rules' });
  await expect(rules.getByRole('listitem').first()).toHaveText(/No cheating\./);
  await expectAccessible(them, 'welcome steps');
  await them.getByRole('button', { name: 'Finish and go to the community' }).click();
  await expect(them.getByText('Tick the box to agree to the rules first.')).toBeVisible();
  await them.getByRole('button', { name: 'Healer' }).click();
  await expect(them.getByRole('button', { name: 'Healer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await them.getByLabel('I’ve read and agree to the rules').check();
  await them.getByRole('button', { name: 'Finish and go to the community' }).click();
  await them.waitForURL(new RegExp(`/c/${slug}$`));

  // Now they can talk.
  await them.goto(`/c/${slug}/chat/lounge`);
  const composer = them.getByRole('textbox', { name: 'Message #lounge' });
  await composer.fill('Hello everyone!');
  await composer.press('Enter');
  await expect(
    them.locator('article[data-message-id]').filter({ hasText: 'Hello everyone!' }),
  ).toBeVisible();
  await context.close();
});
