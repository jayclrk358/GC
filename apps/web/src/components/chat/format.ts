import type { Prefs } from '@magnox/shared';

/** "3:04 PM" / "15:04", following the reader's time-format preference. */
export function formatTime(
  d: string | Date,
  timeFormat: Prefs['timeFormat'],
  locale = 'en',
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === 'auto' ? undefined : timeFormat === '12h',
  }).format(new Date(d));
}

/** Day heading for dividers: Today, Yesterday or a full date. */
export function formatDay(
  d: string | Date,
  labels: { today: string; yesterday: string },
  locale = 'en',
): string {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.toDateString() === today.toDateString()) return labels.today;
  if (date.toDateString() === yesterday.toDateString()) return labels.yesterday;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export function fullDateTime(
  d: string | Date,
  timeFormat: Prefs['timeFormat'],
  locale = 'en',
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    hour12: timeFormat === 'auto' ? undefined : timeFormat === '12h',
  }).format(new Date(d));
}
