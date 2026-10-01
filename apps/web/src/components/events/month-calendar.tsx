import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventOccurrenceView } from '@magnox/core';
import { daysInMonth, weekdayOf } from '@magnox/shared';
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
  clock,
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
  const t = await getTranslations('events');
  const byDay = new Map<string, EventOccurrenceView[]>();
  for (const o of occurrences) {
    const k = dayKey(o.start, clock.timeZone);
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }
  const [y, m] = month.split('-').map(Number) as [number, number];
  const title = new Intl.DateTimeFormat(clock.locale ?? 'en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  // Monday to Sunday, in the viewer's language (5 Jan 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + i)));
  const long = new Intl.DateTimeFormat(clock.locale ?? 'en', { weekday: 'long', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat(clock.locale ?? 'en', {
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
      <div className="overflow-x-auto">
        <table
          aria-labelledby="calendar-title"
          className="w-full min-w-[44rem] table-fixed border-collapse"
        >
          <thead>
            <tr>
              {weekdays.map((d) => (
                <th
                  key={d.toISOString()}
                  scope="col"
                  className="pb-2 text-start text-sm font-semibold text-muted"
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
                {week.map((cell) => {
                  const items = byDay.get(cell.key) ?? [];
                  const isToday = cell.key === today;
                  const date = new Date(`${cell.key}T12:00:00Z`);
                  return (
                    <td
                      key={cell.key}
                      aria-current={isToday ? 'date' : undefined}
                      className={cn(
                        'h-28 border border-border p-1.5 align-top',
                        cell.inMonth ? 'bg-surface' : 'bg-surface-2/60 text-muted',
                      )}
                    >
                      <div className="flex h-full flex-col gap-1">
                        <span
                          className={cn(
                            'inline-flex size-7 items-center justify-center self-start rounded-full text-sm font-semibold',
                            isToday && 'bg-primary text-on-primary',
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
                                className="block truncate rounded px-1 py-0.5 text-xs font-medium text-fg hover:bg-primary/12 focus-visible:bg-primary/12"
                              >
                                {!o.allDay && (
                                  <span className="text-muted">{formatClock(o.start, clock)} </span>
                                )}
                                {o.title}
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
