import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, Repeat } from 'lucide-react';
import type { EventOccurrenceView } from '@gamecentral/core';
import { Badge } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import {
  dateParts,
  dayKey,
  eventTiming,
  formatDay,
  formatEventRange,
  formatTimes,
  nearDay,
  type ClockOptions,
} from '@/lib/event-format';
import { DateTile, FaceStack, PlacesBar, TimingBadge } from './event-bits';
import { RsvpControl } from './rsvp-control';

export function occurrenceHref(slug: string, o: { eventId: string; start: string }) {
  return `/c/${slug}/events/${o.eventId}?at=${encodeURIComponent(o.start)}`;
}

type T = Awaited<ReturnType<typeof getTranslations<'events'>>>;

/** "9 going", "9 of 12 places taken" or "Full (12 places)"; nothing when there's nothing to say. */
function attendance(t: T, o: EventOccurrenceView): string | null {
  if (o.capacity > 0) {
    return o.going >= o.capacity
      ? t('fullPlaces', { capacity: o.capacity })
      : t('places', { taken: o.going, capacity: o.capacity });
  }
  return o.going > 0 ? t('going', { count: o.going }) : null;
}

/** Your answer, as a badge. */
function MineBadge({ t, mine }: { t: T; mine: EventOccurrenceView['mine'] }) {
  if (mine === 'going') return <Badge tone="success">{t('youreGoing')}</Badge>;
  if (mine === 'maybe') return <Badge>{t('youMightGo')}</Badge>;
  return null;
}

/**
 * Events as an agenda: a column of days, each with its events. With `feature`, the first one
 * comes first on its own, big, with how long until it starts, who's going and (if the viewer can
 * answer) the answer buttons. Later dates of an event already shown are a single line.
 */
export async function EventList({
  occurrences,
  slug,
  clock: options,
  headingLevel = 3,
  feature = false,
  rsvp = null,
}: {
  occurrences: EventOccurrenceView[];
  slug: string;
  clock: ClockOptions;
  headingLevel?: 2 | 3;
  feature?: boolean;
  /** Set when the viewer can answer events here (for the featured one's buttons). */
  rsvp?: { communityId: string } | null;
}) {
  const [t, locale] = await Promise.all([getTranslations('events'), getLocale()]);
  // The page's language unless the caller chose one.
  const clock = { ...options, locale: options.locale ?? locale };
  const now = new Date();
  const featured = feature ? occurrences[0] : undefined;
  const rest = featured ? occurrences.slice(1) : occurrences;
  const seen = new Set(featured ? [featured.eventId] : []);

  const groups: { key: string; items: { o: EventOccurrenceView; again: boolean }[] }[] = [];
  for (const o of rest) {
    const key = dayKey(o.start, clock.timeZone);
    const item = { o, again: seen.has(o.eventId) };
    seen.add(o.eventId);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }

  const H = `h${headingLevel}` as 'h2' | 'h3';
  const Item = `h${headingLevel + 1}` as 'h3' | 'h4';
  const monthLabel = (at: string) =>
    new Intl.DateTimeFormat(clock.locale, {
      timeZone: clock.timeZone,
      month: 'long',
      year: 'numeric',
    }).format(new Date(at));
  const timingLabels = {
    now: t('happeningNow'),
    ended: t('endedShort'),
    startsIn: (when: string) => t('startsIn', { when }),
  };

  return (
    <div className="flex flex-col gap-6">
      {featured && (
        <Featured
          o={featured}
          t={t}
          slug={slug}
          clock={clock}
          now={now}
          H={H}
          rsvp={rsvp}
          timingLabels={timingLabels}
        />
      )}
      {groups.length > 0 && (
        <div className="flex flex-col gap-5">
          {groups.map((g, i) => {
            const first = g.items[0]!.o;
            const parts = dateParts(first.start, clock);
            const near = nearDay(first.start, now, clock);
            const prevMonth =
              i > 0
                ? groups[i - 1]!.key.slice(0, 7)
                : featured
                  ? dayKey(featured.start, clock.timeZone).slice(0, 7)
                  : null;
            const newMonth = prevMonth !== null && prevMonth !== g.key.slice(0, 7);
            return (
              <div key={g.key} className="flex flex-col gap-5">
                {newMonth && (
                  <div aria-hidden className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-bold tracking-wider text-muted uppercase">
                      {monthLabel(first.start)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <section
                  aria-labelledby={`day-${g.key}`}
                  className="grid grid-cols-[3rem_1fr] gap-x-3 sm:grid-cols-[4rem_1fr] sm:gap-x-4"
                >
                  <H id={`day-${g.key}`} className="flex flex-col items-center pt-2 text-center">
                    <span className="sr-only">{formatDay(first.start, clock)}</span>
                    <span aria-hidden className="text-xs font-semibold text-muted uppercase">
                      {parts.weekday}
                    </span>
                    <span aria-hidden className="text-2xl leading-tight font-bold tabular-nums">
                      {parts.day}
                    </span>
                    {near ? (
                      <span className="mt-0.5 rounded-full bg-primary/12 px-1.5 text-[0.6875rem] font-semibold text-primary">
                        {near}
                      </span>
                    ) : (
                      <span aria-hidden className="text-xs text-muted">
                        {parts.month}
                      </span>
                    )}
                  </H>
                  <ul className="flex min-w-0 flex-col justify-center divide-y divide-border overflow-hidden rounded-ui-lg border border-border bg-surface">
                    {g.items.map(({ o, again }) => (
                      <li
                        key={`${o.eventId}:${o.start}`}
                        className="relative transition-colors focus-within:bg-surface-2/70 hover:bg-surface-2/70"
                      >
                        {again ? (
                          <RepeatRow o={o} t={t} slug={slug} clock={clock} Item={Item} />
                        ) : (
                          <Row o={o} t={t} slug={slug} clock={clock} Item={Item} />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The whole row or card is clickable through its title's link. */
const cover = 'after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none';

function Row({
  o,
  t,
  slug,
  clock,
  Item,
}: {
  o: EventOccurrenceView;
  t: T;
  slug: string;
  clock: ClockOptions;
  Item: 'h3' | 'h4';
}) {
  const times = formatTimes(o.start, o.end, o.allDay, clock);
  const people = attendance(t, o);
  const full = o.capacity > 0 && o.going >= o.capacity;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold text-primary tabular-nums">{times ?? t('allDay')}</p>
        <Item className="text-base leading-snug font-semibold">
          <Link href={occurrenceHref(slug, o)} className={cover}>
            {o.title}
          </Link>
        </Item>
        {o.location && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{o.location}</span>
          </p>
        )}
        {(o.repeats || full || o.mine) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {o.repeats && (
              <Badge>
                <Repeat aria-hidden className="size-3" /> {t('repeats')}
              </Badge>
            )}
            {full && <Badge tone="warning">{t('full')}</Badge>}
            <MineBadge t={t} mine={o.mine} />
          </div>
        )}
      </div>
      {people && (
        <div className="flex shrink-0 items-center gap-3 sm:w-44 sm:flex-col sm:items-end sm:gap-1.5">
          <FaceStack
            faces={o.goingPreview}
            total={o.going}
            size={26}
            label={t('going', { count: o.going })}
          />
          <span className="text-xs text-muted sm:text-end">{people}</span>
          {o.capacity > 0 && (
            <span className="w-20 sm:w-28">
              <PlacesBar taken={o.going} capacity={o.capacity} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A later date of an event shown above it: one line. */
function RepeatRow({
  o,
  t,
  slug,
  clock,
  Item,
}: {
  o: EventOccurrenceView;
  t: T;
  slug: string;
  clock: ClockOptions;
  Item: 'h3' | 'h4';
}) {
  const times = formatTimes(o.start, o.end, o.allDay, clock);
  const people = attendance(t, o);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className="w-full font-semibold text-primary tabular-nums sm:w-auto sm:min-w-32">
        {times ?? t('allDay')}
      </span>
      <Item className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
        <Repeat aria-hidden className="size-3.5 shrink-0 text-muted" />
        <Link href={occurrenceHref(slug, o)} className={cn(cover, 'block min-w-0 truncate')}>
          {o.title}
        </Link>
      </Item>
      <MineBadge t={t} mine={o.mine} />
      {/* On a phone the title needs the room; the event's page has the numbers. */}
      {people && <span className="hidden text-xs text-muted sm:inline">{people}</span>}
    </div>
  );
}

function Featured({
  o,
  t,
  slug,
  clock,
  now,
  H,
  rsvp,
  timingLabels,
}: {
  o: EventOccurrenceView;
  t: T;
  slug: string;
  clock: ClockOptions;
  now: Date;
  H: 'h2' | 'h3';
  rsvp: { communityId: string } | null;
  timingLabels: React.ComponentProps<typeof TimingBadge>['labels'];
}) {
  const parts = dateParts(o.start, clock);
  const timing = eventTiming(o.start, o.end, now, clock);
  const people = attendance(t, o);
  const full = o.capacity > 0 && o.going >= o.capacity;
  return (
    <section
      aria-labelledby={`next-${o.eventId}`}
      className="relative overflow-hidden rounded-ui-lg border border-primary/30 bg-surface p-5 shadow-sm sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-accent/10"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-primary uppercase">
            {t('nextUp')}
          </span>
          <TimingBadge timing={timing} labels={timingLabels} />
          {o.repeats && (
            <Badge>
              <Repeat aria-hidden className="size-3" /> {t('repeats')}
            </Badge>
          )}
          {full && <Badge tone="warning">{t('full')}</Badge>}
          <MineBadge t={t} mine={o.mine} />
        </div>
        <div className="flex gap-4 sm:gap-5">
          <DateTile
            month={parts.month}
            day={parts.day}
            weekday={parts.weekday}
            size="lg"
            className="self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <H id={`next-${o.eventId}`} className="text-xl leading-tight font-bold sm:text-2xl">
              <Link href={occurrenceHref(slug, o)} className={cover}>
                {o.title}
              </Link>
            </H>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Clock aria-hidden className="size-4 shrink-0 text-muted" />
              {formatEventRange(o.start, o.end, o.allDay, clock)}
            </p>
            {o.location && (
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
                <MapPin aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{o.location}</span>
              </p>
            )}
            {o.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{o.summary}</p>}
          </div>
        </div>
        {(people || rsvp) && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            {people ? (
              <div className="flex min-w-0 items-center gap-3">
                <FaceStack
                  faces={o.goingPreview}
                  total={o.going}
                  size={32}
                  label={t('going', { count: o.going })}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium">
                    {people}
                    {o.maybe > 0 && (
                      <span className="text-muted"> · {t('maybeCount', { count: o.maybe })}</span>
                    )}
                  </span>
                  {o.capacity > 0 && (
                    <span className="w-36">
                      <PlacesBar taken={o.going} capacity={o.capacity} />
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('beFirst')}</p>
            )}
            {rsvp && (
              // Above the card's link, so the buttons get the clicks.
              <div className="relative z-10">
                <RsvpControl
                  communityId={rsvp.communityId}
                  eventId={o.eventId}
                  at={o.start}
                  initial={{ going: o.going, maybe: o.maybe, mine: o.mine }}
                  capacity={o.capacity}
                  label={o.title}
                  compact
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
