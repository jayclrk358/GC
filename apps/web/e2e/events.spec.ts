import { expect, test } from '@playwright/test';
import {
  choose,
  createCommunity,
  expectAccessible,
  joinAsMember,
  signUp,
  uniqueUser,
} from './helpers';

// Somewhere with daylight saving, so times have to be handled with care.
test.use({ timezoneId: 'Europe/London' });

/** A date some days from now, as the date inputs want it ("2026-10-09"). */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

test('events: schedule a repeating event, answer it, fill it up and call off a date', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await signUp(page, uniqueUser('events'), '/new');
  const { slug } = await createCommunity(page);

  await page.goto(`/c/${slug}/events`);
  await expect(page.getByText('No events coming up.')).toBeVisible();
  await expect(page.getByText('Times are shown in your time zone (Europe/London).')).toBeVisible();
  await expectAccessible(page, 'events (empty)');

  // A weekly raid night with one place, starting in two days.
  await page.getByRole('link', { name: 'New event' }).first().click();
  await expect(page.getByRole('heading', { name: 'New event' })).toBeVisible();
  await page.getByLabel('Name').fill('Raid night');
  await page.getByLabel('Description').fill('Bring potions.\nVoice in #hangout.');
  await page.getByLabel('Where').fill('EU-1 server');
  const date = inDays(2);
  await page.getByLabel('Starts').fill(date);
  await page.getByLabel('Start time').fill('20:00');
  await page.getByRole('textbox', { name: 'Ends', exact: true }).fill(date);
  await page.getByLabel('End time').fill('22:00');
  await expect(page.getByLabel('Time zone')).toContainText('Europe/London');
  await choose(page.getByRole('combobox', { name: 'Repeat' }), 'Weekly');
  await page.getByRole('radio', { name: 'After a number of times' }).check();
  await page.getByLabel('How many times').fill('4');
  await page.getByLabel('Number of places').fill('1');
  await expectAccessible(page, 'event form');
  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Raid night' })).toBeVisible();
  await expect(page.getByText(/^Every week on \w+day, 4 times$/)).toBeVisible();
  await expect(page.getByText('EU-1 server')).toBeVisible();
  // 20:00 London time, on a London clock (English shows 12-hour times by default).
  await expect(page.getByText(/8:00\sPM – 10:00\sPM/).first()).toBeVisible();
  const eventUrl = page.url();

  // Saying you're going takes the only place.
  const answers = page.getByRole('group', { name: 'Will you go?' });
  await answers.getByRole('button', { name: 'Going' }).click();
  await expect(answers.getByRole('button', { name: 'Going' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Full (1 places)').first()).toBeVisible();
  await expectAccessible(page, 'event page');

  // The other dates are listed, and the calendar file has the series.
  await expect(page.getByRole('region', { name: 'Other dates' }).getByRole('link')).toHaveCount(3);
  const ics = await page.request.get(
    `/c/${slug}/events/${eventUrl.split('/').pop()!.split('?')[0]}/event.ics`,
  );
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('SUMMARY:Raid night');
  expect(body).toContain('RRULE:FREQ=WEEKLY;COUNT=4');
  expect(body).toContain('DTSTART;TZID=Europe/London:');
  // A public community's feed needs no key.
  const feed = await page.request.get(`/c/${slug}/events/feed.ics`);
  expect(await feed.text()).toContain('BEGIN:VEVENT');

  // Someone else can't take a place that's gone, but can say maybe.
  const member = await joinAsMember(browser, slug, 'guest');
  await member.page.goto(eventUrl);
  const theirs = member.page.getByRole('group', { name: 'Will you go?' });
  await expect(theirs.getByRole('button', { name: 'Going' })).toBeDisabled();
  await theirs.getByRole('button', { name: 'Maybe' }).click();
  await expect(theirs.getByRole('button', { name: 'Maybe' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(member.page.getByText('1 maybe')).toBeVisible();

  // The list and the month calendar show it.
  await page.goto(`/c/${slug}/events`);
  await expect(page.getByRole('link', { name: 'Raid night' }).first()).toBeVisible();
  await expect(page.getByText("You're going")).toBeVisible();
  await page.getByRole('link', { name: 'Month' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  const monthOf = date.slice(0, 7);
  await page.goto(`/c/${slug}/events?view=month&month=${monthOf}`);
  await expect(
    page
      .getByRole('table')
      .getByRole('link', { name: /Raid night/ })
      .first(),
  ).toBeVisible();
  await expectAccessible(page, 'month calendar');

  // Calling off the first date tells the people coming, and leaves the rest.
  await page.goto(eventUrl);
  await page.getByRole('button', { name: 'Cancel this date' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Call it off' }).click();
  await expect(page.getByText('This date was cancelled. Other dates go ahead.')).toBeVisible();
  await member.page.goto('/notifications');
  await expect(member.page.getByText(/Raid night on .* was cancelled/)).toBeVisible();
  await page.goto(`/c/${slug}/events`);
  await expect(page.getByRole('link', { name: 'Raid night' })).toHaveCount(3);

  // The events tab is in the community's navigation.
  await expect(
    page.getByRole('navigation', { name: / sections$/ }).getByRole('link', { name: 'Events' }),
  ).toBeVisible();
  await member.context.close();
});
