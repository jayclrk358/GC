import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, Repeat, Users } from 'lucide-react';
import type { EventOccurrenceView } from '@gamecentral/core';
import { Badge } from '@/components/ui/misc';
import { dayKey, formatDay, formatEventRange, type ClockOptions } from '@/lib/event-format';

export function occurrenceHref(slug: string, o: { eventId: string; start: string }) {
  return `/c/${slug}/events/${o.eventId}?at=${encodeURIComponent(o.start)}`;
}

/** Events grouped under the day they start (on the viewer's clock). */
export async function EventList({
  occurrences,
  slug,
  clock: options,
  headingLevel = 3,
}: {
  occurrences: EventOccurrenceView[];
  slug: string;
  clock: ClockOptions;
  headingLevel?: 2 | 3;
}) {
  const [t, locale] = await Promise.all([getTranslations('events'), getLocale()]);
  // The page's language unless the caller chose one.
  const clock = { ...options, locale: options.locale ?? locale };
  const groups: { key: string; items: EventOccurrenceView[] }[] = [];
  for (const o of occurrences) {
    const key = dayKey(o.start, clock.timeZone);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(o);
    else groups.push({ key, items: [o] });
  }
  const H = `h${headingLevel}` as 'h2' | 'h3';
  const Item = `h${headingLevel + 1}` as 'h3' | 'h4';
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`day-${g.key}`} className="flex flex-col gap-3">
          <H id={`day-${g.key}`} className="text-sm font-semibold text-muted">
            {formatDay(g.items[0]!.start, clock)}
          </H>
          <ul className="flex flex-col gap-3">
            {g.items.map((o) => {
              const day = new Intl.DateTimeFormat(clock.locale, {
                timeZone: clock.timeZone,
                day: 'numeric',
              }).format(new Date(o.start));
              const month = new Intl.DateTimeFormat(clock.locale, {
                timeZone: clock.timeZone,
                month: 'short',
              }).format(new Date(o.start));
              const full = o.capacity > 0 && o.going >= o.capacity;
              return (
                <li
                  key={`${o.eventId}:${o.start}`}
                  className="relative flex gap-4 rounded-ui-lg border border-border bg-surface p-4 transition-colors focus-within:border-primary hover:border-primary/60"
                >
                  <div
                    aria-hidden
                    className="flex size-14 shrink-0 flex-col items-center justify-center rounded-ui bg-primary/12 text-primary"
                  >
                    <span className="text-xs font-semibold uppercase">{month}</span>
                    <span className="text-xl leading-none font-bold">{day}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Item className="text-lg font-semibold">
                      {/* The whole card is clickable through this link. */}
                      <Link
                        href={occurrenceHref(slug, o)}
                        className="after:absolute after:inset-0 after:rounded-ui-lg focus-visible:outline-none"
                      >
                        {o.title}
                      </Link>
                    </Item>
                    <p className="flex items-center gap-1.5 text-sm">
                      <Clock aria-hidden className="size-4 shrink-0 text-muted" />
                      {formatEventRange(o.start, o.end, o.allDay, clock)}
                    </p>
                    {o.location && (
                      <p className="flex items-center gap-1.5 text-sm text-muted">
                        <MapPin aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{o.location}</span>
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span className="flex items-center gap-1">
                        <Users aria-hidden className="size-4" />
                        {o.capacity > 0
                          ? t('places', { taken: o.going, capacity: o.capacity })
                          : t('going', { count: o.going })}
                      </span>
                      {o.repeats && (
                        <Badge>
                          <Repeat aria-hidden className="size-3" /> {t('repeats')}
                        </Badge>
                      )}
                      {full && <Badge tone="warning">{t('full')}</Badge>}
                      {o.mine === 'going' && <Badge tone="success">{t('youreGoing')}</Badge>}
                      {o.mine === 'maybe' && <Badge>{t('youMightGo')}</Badge>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
