export type TimeFormat = 'auto' | '12h' | '24h';

export function formatDate(d: Date | string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(d));
}

export function formatDateTime(d: Date | string, timeFormat: TimeFormat = 'auto', locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: timeFormat === 'auto' ? undefined : timeFormat === '12h',
  }).format(new Date(d));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function relativeTime(d: Date | string, now = Date.now(), locale = 'en'): string {
  const diff = (new Date(d).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), 'second');
}
