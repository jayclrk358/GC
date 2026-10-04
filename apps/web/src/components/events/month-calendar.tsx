import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventOccurrenceView } from '@gamecentral/core';
import { daysInMonth, weekdayOf } from '@gamecentral/shared';
import { cn } from '@/lib/utils';
import { dayKey, formatClock, formatDay, type ClockOptions } from '@/lib/event-format';
import { occurrenceHref } from './event-list';

/** Shown per day before "+N more". */
const PER_DAY = 3;

const pad = (n: number) => String(n).padStart(2, '0');

/** The month before or after "2026-10". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The days shown for a month: whole weeks, Monday first. */
export function monthGrid(month: string): { key: string; inMonth: boolean; day: number }[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lead = (weekdayOf({ year: y, month: m, day: 1 }) + 6) % 7;
  const total = daysInMonth(y, m);
  const cells = Math.ceil((lead + total) / 7) * 7;
  const weeks: { key: string; inMonth: boolean; day: number }[][] = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (i % 7 === 0) weeks.push([]);
    weeks.at(-1)!.push({ key, inMonth: d.getUTCMonth() === m - 1, day: d.getUTCDate() });
  }
  return weeks;
}

export async function MonthCalendar({
  month,
  occurrences,
  slug,
  clock: options,
  today,
  hrefFor,
}: {
  /** "2026-10" */
  month: string;
  occurrences: EventOccurrenceView[];
  slug: string;
  clock: ClockOptions;
  /** Today's date on the viewer's clock ("2026-10-03"). */
  today: string;
  hrefFor: (month: string) => string;
}) {
  const [t, locale] = await Promise.all([getTranslations('events'), getLocale()]);
  // The page's language unless the caller chose one.
  const clock = { ...options, locale: options.locale ?? locale };
  const byDay = new Map<string, EventOccurrenceView[]>();
  for (const o of occurrences) {
    const k = dayKey(o.start, clock.timeZone);
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }
  const [y, m] = month.split('-').map(Number) as [number, number];
  const title = new Intl.DateTimeFormat(clock.locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  // Monday to Sunday, in the viewer's language (5 Jan 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + i)));
  const long = new Intl.DateTimeFormat(clock.locale, { weekday: 'long', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat(clock.locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const thisMonth = today.slice(0, 7);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold" id="calendar-title">
          {title}
        </h3>
        <nav aria-label={t('monthNav')} className="flex items-center gap-1">
          <Link
            href={hrefFor(shiftMonth(month, -1))}
            className="inline-flex size-9 items-center justify-center rounded-ui border border-border hover:bg-surface-2"
            aria-label={t('prevMonth')}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
          {month !== thisMonth && (
            <Link
              href={hrefFor(thisMonth)}
              className="inline-flex h-9 items-center rounded-ui border border-border px-3 text-sm font-semibold hover:bg-surface-2"
            >
              {t('thisMonth')}
            </Link>
          )}
          <Link
            href={hrefFor(shiftMonth(month, 1))}
            className="inline-flex size-9 items-center justify-center rounded-ui border border-border hover:bg-surface-2"
            aria-label={t('nextMonth')}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </nav>
      </div>
      <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
        <table
          aria-labelledby="calendar-title"
          className="w-full min-w-[44rem] table-fixed border-collapse"
        >
          <thead>
            <tr className="bg-surface-2/70">
              {weekdays.map((d) => (
                <th
                  key={d.toISOString()}
                  scope="col"
                  className="px-2 py-2 text-start text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  <abbr title={long.format(d)} className="no-underline">
                    {short.format(d)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(month).map((week) => (
              <tr key={week[0]!.key}>
                {week.map((cell, i) => {
                  const items = byDay.get(cell.key) ?? [];
                  const isToday = cell.key === today;
                  const past = cell.key < today;
                  const date = new Date(`${cell.key}T12:00:00Z`);
                  return (
                    <td
                      key={cell.key}
                      aria-current={isToday ? 'date' : undefined}
                      className={cn(
                        'h-28 border-t border-border p-1.5 align-top',
                        i > 0 && 'border-s',
                        !cell.inMonth
                          ? 'bg-surface-2 text-muted'
                          : isToday
                            ? 'bg-primary/8'
                            : i >= 5 && 'bg-surface-2/45',
                      )}
                    >
                      <div className="flex h-full flex-col gap-1">
                        <span
                          className={cn(
                            'inline-flex size-7 items-center justify-center self-start rounded-full text-sm font-semibold tabular-nums',
                            isToday && 'bg-primary text-on-primary',
                            !isToday && past && cell.inMonth && 'text-muted',
                          )}
                        >
                          <span aria-hidden>{cell.day}</span>
                          <span className="sr-only">
                            {formatDay(date, { ...clock, timeZone: 'UTC' })}
                          </span>
                        </span>
                        <ul className="flex min-w-0 flex-col gap-0.5">
                          {items.slice(0, PER_DAY).map((o) => (
                            <li key={`${o.eventId}:${o.start}`} className="min-w-0">
                              <Link
                                href={occurrenceHref(slug, o)}
                                className={cn(
                                  'flex min-h-6 min-w-0 items-center gap-1 rounded-ui-sm px-1.5 py-1 text-xs font-medium transition-colors',
                                  o.allDay
                                    ? 'bg-primary text-on-primary hover:bg-primary/85'
                                    : 'bg-primary/10 text-fg hover:bg-primary/20 focus-visible:bg-primary/20',
                                  cell.key < today && 'opacity-70',
                                )}
                              >
                                {!o.allDay && (
                                  <span
                                    aria-hidden
                                    className={cn(
                                      'size-1.5 shrink-0 rounded-full',
                                      o.mine === 'going' ? 'bg-success' : 'bg-primary',
                                    )}
                                  />
                                )}
                                {!o.allDay && (
                                  <span className="shrink-0 font-semibold tabular-nums">
                                    {formatClock(o.start, clock)}
                                  </span>
                                )}
                                <span className="truncate">{o.title}</span>
                                {o.mine === 'going' && (
                                  <span className="sr-only">, {t('youreGoing')}</span>
                                )}
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {items.length > PER_DAY && (
                          <p className="px-1 text-xs text-muted">
                            {t('moreOnDay', { count: items.length - PER_DAY })}
                          </p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
