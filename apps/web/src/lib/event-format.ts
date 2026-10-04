import { localDateKey, utcToZoned } from '@gamecentral/shared';
import type { TimeFormat } from './format';
import { dateFormat, relativeFormat } from './intl-cache';

/** How event times read, on the viewer's clock. */
export interface ClockOptions {
  timeZone: string;
  locale?: string;
  timeFormat?: TimeFormat;
}

const hour12 = (f?: TimeFormat) => (f === '12h' ? true : f === '24h' ? false : undefined);

function fmt(o: ClockOptions, opts: Intl.DateTimeFormatOptions) {
  return dateFormat(o.locale ?? 'en', {
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

/** Just the times on the day: "20:00 – 22:30", or null for all-day events. */
export function formatTimes(
  start: Date | string,
  end: Date | string,
  allDay: boolean,
  o: ClockOptions,
): string | null {
  if (allDay) return null;
  const sameDay = dayKey(start, o.timeZone) === dayKey(end, o.timeZone);
  return sameDay
    ? `${formatClock(start, o)} – ${formatClock(end, o)}`
    : `${formatClock(start, o)} – ${fmt(o, { weekday: 'short' }).format(new Date(end))} ${formatClock(end, o)}`;
}

/** The parts of a date tile: "OCT", "6", "Tue". */
export function dateParts(at: Date | string, o: ClockOptions) {
  const d = new Date(at);
  return {
    month: fmt(o, { month: 'short' }).format(d),
    day: fmt(o, { day: 'numeric' }).format(d),
    weekday: fmt(o, { weekday: 'short' }).format(d),
  };
}

/** Whole calendar days from one local day key to another ("2026-10-03" → "2026-10-05" is 2). */
function daysBetween(from: string, to: string): number {
  const ms = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export type EventTiming =
  | { state: 'now' }
  | { state: 'ended' }
  /** `when` reads after "Starts": "in 25 minutes", "tomorrow", "in 3 days". */
  | { state: 'soon' | 'later'; when: string };

/** Where an event is relative to now, in words. */
export function eventTiming(
  start: Date | string,
  end: Date | string,
  now: Date,
  o: ClockOptions,
): EventTiming {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const t = now.getTime();
  if (t >= e) return { state: 'ended' };
  if (t >= s) return { state: 'now' };
  const rtf = relativeFormat(o.locale ?? 'en', { numeric: 'auto' });
  const minutes = Math.ceil((s - t) / 60_000);
  if (minutes < 60) return { state: 'soon', when: rtf.format(minutes, 'minute') };
  const days = daysBetween(dayKey(now, o.timeZone), dayKey(start, o.timeZone));
  if (days === 0 || minutes < 6 * 60) {
    return { state: 'soon', when: rtf.format(Math.round(minutes / 60), 'hour') };
  }
  if (days < 14) return { state: 'later', when: rtf.format(days, 'day') };
  if (days < 60) return { state: 'later', when: rtf.format(Math.round(days / 7), 'week') };
  return { state: 'later', when: rtf.format(Math.round(days / 30), 'month') };
}

/** "Today" / "Tomorrow" for a day, if it's one of those (on the viewer's clock). */
export function nearDay(at: Date | string, now: Date, o: ClockOptions): string | null {
  const days = daysBetween(dayKey(now, o.timeZone), dayKey(at, o.timeZone));
  if (days !== 0 && days !== 1 && days !== -1) return null;
  const word = relativeFormat(o.locale ?? 'en', { numeric: 'auto' }).format(days, 'day');
  return word.charAt(0).toLocaleUpperCase(o.locale) + word.slice(1);
}
