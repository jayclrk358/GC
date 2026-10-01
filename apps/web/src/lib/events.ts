import 'server-only';
import { calendarFeedKey, env } from '@magnox/core';
import { utcToZoned, weekdayOf, type Recurrence } from '@magnox/shared';

/** Where calendar apps fetch a community's events (with a member key if it's private). */
export function feedUrl(
  community: { id: string; slug: string; visibility: string },
  userId: string | null,
  isMember: boolean,
): string | null {
  const base = `${env().APP_URL}/c/${community.slug}/events/feed.ics`;
  if (community.visibility !== 'private') return base;
  if (!userId || !isMember) return null;
  return `${base}?u=${encodeURIComponent(userId)}&k=${calendarFeedKey(community.id, userId)}`;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "Every 2 weeks on Monday and Wednesday, until 1 December 2026". */
export function describeRecurrence(
  rule: Recurrence,
  t: Translate,
  locale: string,
  startsAt: Date,
  timeZone: string,
): string {
  const parts: string[] = [];
  if (rule.freq === 'daily') parts.push(t('rule.daily', { interval: rule.interval }));
  if (rule.freq === 'monthly') {
    const day = utcToZoned(startsAt, timeZone).day;
    parts.push(t('rule.monthly', { interval: rule.interval, day }));
  }
  if (rule.freq === 'weekly') {
    const name = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    const days = (
      rule.weekdays.length
        ? [...rule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        : [weekdayOf(utcToZoned(startsAt, timeZone))]
    ).map((d) => name.format(new Date(Date.UTC(2026, 0, 4 + (d === 0 ? 7 : d)))));
    const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(days);
    parts.push(t('rule.weekly', { interval: rule.interval, days: list }));
  }
  if (rule.until) {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${rule.until}T12:00:00Z`),
    );
    parts.push(t('rule.until', { date }));
  } else if (rule.count !== null) {
    parts.push(t('rule.count', { count: rule.count }));
  }
  return parts.join(', ');
}

const gcalTime = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** A link that opens Google Calendar with this date of the event filled in. */
export function googleCalendarUrl(e: {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  url: string;
}): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${gcalTime(new Date(e.start))}/${gcalTime(new Date(e.end))}`,
    details: [e.description, e.url].filter(Boolean).join('\n\n'),
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
