import { localDateKey, utcToZoned } from '@gamecentral/shared';
import type { TimeFormat } from './format';

/** How event times read, on the viewer's clock. */
export interface ClockOptions {
  timeZone: string;
  locale?: string;
  timeFormat?: TimeFormat;
}

const hour12 = (f?: TimeFormat) => (f === '12h' ? true : f === '24h' ? false : undefined);

function fmt(o: ClockOptions, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(o.locale ?? 'en', {
    timeZone: o.timeZone,
    hour12: hour12(o.timeFormat),
    ...opts,
  });
}

/** The local calendar day ("2026-10-03") an instant falls on. */
export function dayKey(at: Date | string, timeZone: string): string {
  return localDateKey(utcToZoned(new Date(at), timeZone));
}

/** "Friday 3 October 2026" */
export function formatDay(at: Date | string, o: ClockOptions): string {
  return fmt(o, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(at),
  );
}

/** "20:00" / "8:00 PM" */
export function formatClock(at: Date | string, o: ClockOptions): string {
  return fmt(o, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/**
 * When an event happens, briefly: "Fri 3 Oct, 20:00 – 22:00", across days
 * "Fri 3 Oct, 20:00 – Sat 4 Oct, 02:00", all day "Fri 3 Oct" or "Fri 3 – Sun 5 Oct".
 */
export function formatEventRange(
  start: Date | string,
  end: Date | string,
  allDay: boolean,
  o: ClockOptions,
): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = fmt(o, { weekday: 'short', day: 'numeric', month: 'short' });
  if (allDay) {
    // All-day events end at midnight after their last day.
    const last = new Date(e.getTime() - 60_000);
    return dayKey(s, o.timeZone) === dayKey(last, o.timeZone)
      ? day.format(s)
      : `${day.format(s)} – ${day.format(last)}`;
  }
  const sameDay = dayKey(s, o.timeZone) === dayKey(e, o.timeZone);
  return sameDay
    ? `${day.format(s)}, ${formatClock(s, o)} – ${formatClock(e, o)}`
    : `${day.format(s)}, ${formatClock(s, o)} – ${day.format(e)}, ${formatClock(e, o)}`;
}

/** A time zone's short name at a moment ("BST", "GMT+2"). */
export function zoneName(at: Date | string, timeZone: string, locale = 'en'): string {
  return (
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
  );
}
