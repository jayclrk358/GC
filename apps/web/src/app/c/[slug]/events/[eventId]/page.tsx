import { cache } from 'react';
import Link from '@/components/ui/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, Repeat } from 'lucide-react';
import { env, getEventDetail, isAppError } from '@gamecentral/core';
import { EVENT_HORIZON_MS } from '@gamecentral/shared';
import { loadCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { getViewerTimeZone } from '@/lib/timezone';
import { describeRecurrence, googleCalendarUrl } from '@/lib/events';
import {
  dateParts,
  eventTiming,
  formatDay,
  formatEventRange,
  formatTimes,
  zoneName,
} from '@/lib/event-format';
import { Alert, Avatar, Badge } from '@/components/ui/misc';
import { BackLink } from '@/components/ui/back-link';
import { RsvpControl } from '@/components/events/rsvp-control';
import { EventManage } from '@/components/events/event-manage';
import { AddToCalendar } from '@/components/events/calendar-links';
import { TimezoneSync } from '@/components/events/timezone-sync';
import { occurrenceHref } from '@/components/events/event-list';
import { DateTile, PlacesBar, TimingBadge } from '@/components/events/event-bits';

type Params = Promise<{ slug: string; eventId: string }>;

/**
 * The date asked for, if it could be one at all: a real date no further ahead than events are
 * looked at. (The event checks it's one of its own, within its series.) Anything else shows the
 * next date, rather than failing on a date too far out to work with.
 */
function requestedDate(at?: string): Date | null {
  const when = at ? new Date(at) : null;
  if (!when || Number.isNaN(when.getTime())) return null;
  return when.getTime() <= Date.now() + EVENT_HORIZON_MS ? when : null;
}

// Shared by the metadata and the page, so the event is loaded once per request.
const load = cache(async (slug: string, eventId: string, at?: string) => {
  const data = await loadCommunity(slug);
  try {
    return { data, detail: await getEventDetail(data.ctx, eventId, requestedDate(at)) };
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ at?: string }>;
}) {
  const { slug, eventId } = await params;
  const { at } = await searchParams;
  const { detail } = await load(slug, eventId, at);
  return { title: detail.event.title };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ at?: string }>;
}) {
  const { slug, eventId } = await params;
  const { at } = await searchParams;
  const [{ data, detail }, t, prefs, zone, locale] = await Promise.all([
    load(slug, eventId, at),
    getTranslations('events'),
    getPrefs(),
    getViewerTimeZone(),
    getLocale(),
  ]);
  const { event, occurrence } = detail;
  const timeZone = zone ?? event.timezone;
  const clock = { timeZone, locale, timeFormat: prefs.timeFormat };
  const range = formatEventRange(occurrence.start, occurrence.end, event.allDay, clock);
  // Also say when it is where it's organised, if that's somewhere else.
  const elsewhere =
    !event.allDay && event.timezone !== timeZone
      ? `${formatEventRange(occurrence.start, occurrence.end, false, {
          ...clock,
          timeZone: event.timezone,
        })} ${zoneName(occurrence.start, event.timezone, locale)}`
      : null;
  const repeats = event.recurrence
    ? describeRecurrence(
        event.recurrence,
        (k, v) => t(k as never, v as never),
        locale,
        new Date(event.startsAt),
        event.timezone,
      )
    : null;
  const pageUrl = `${env().APP_URL}/c/${slug}/events/${event.id}`;
  const going = detail.attendees.filter((a) => a.status === 'going');
  const maybe = detail.attendees.filter((a) => a.status === 'maybe');
  const otherDates = detail.upcoming.filter((d) => d !== occurrence.start).slice(0, 5);
  const length = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
  const parts = dateParts(occurrence.start, clock);
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' });
  const timing = eventTiming(occurrence.start, occurrence.end, new Date(), clock);
  const attendance =
    event.capacity > 0
      ? detail.full
        ? t('fullPlaces', { capacity: event.capacity })
        : t('places', { taken: detail.going, capacity: event.capacity })
      : t('going', { count: detail.going });

  return (
    <article className="flex flex-col gap-6" aria-labelledby="event-title">
      <TimezoneSync serverZone={zone} />
      <BackLink href={`/c/${slug}/events`}>{t('allEvents')}</BackLink>

      {detail.cancelled && (
        <Alert tone="warning">
          {detail.seriesCancelled ? t('cancelledNotice') : t('dateCancelledNotice')}
        </Alert>
      )}

      <header className="relative overflow-hidden rounded-ui-lg border border-border bg-surface p-5 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/14 via-transparent to-accent/10"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:gap-6">
          <DateTile
            month={parts.month}
            day={parts.day}
            weekday={parts.weekday}
            size="lg"
            muted={detail.cancelled || detail.ended}
            className="self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {!detail.cancelled && (
              <div className="flex flex-wrap items-center gap-2">
                <TimingBadge
                  timing={timing}
                  labels={{
                    now: t('happeningNow'),
                    ended: t('endedShort'),
                    startsIn: (when) => t('startsIn', { when }),
                  }}
                />
                {detail.mine === 'going' && <Badge tone="success">{t('youreGoing')}</Badge>}
                {detail.mine === 'maybe' && <Badge>{t('youMightGo')}</Badge>}
              </div>
            )}
            <h2
              id="event-title"
              className="text-2xl leading-tight font-bold break-words sm:text-3xl"
            >
              {event.title}
            </h2>
            <dl className="flex flex-col gap-2">
              <div className="flex items-start gap-2.5">
                <dt>
                  <Clock aria-hidden className="mt-0.5 size-5 text-muted" />
                  <span className="sr-only">{t('when')}</span>
                </dt>
                <dd className="flex flex-col">
                  <span className="font-semibold">{range}</span>
                  {elsewhere && (
                    <span className="text-sm text-muted">
                      {t('organiserTime', { time: elsewhere })}
                    </span>
                  )}
                </dd>
              </div>
              {repeats && (
                <div className="flex items-start gap-2.5">
                  <dt>
                    <Repeat aria-hidden className="mt-0.5 size-5 text-muted" />
                    <span className="sr-only">{t('repeats')}</span>
                  </dt>
                  <dd>{repeats}</dd>
                </div>
              )}
              {event.location && (
                <div className="flex items-start gap-2.5">
                  <dt>
                    <MapPin aria-hidden className="mt-0.5 size-5 text-muted" />
                    <span className="sr-only">{t('where')}</span>
                  </dt>
                  <dd className="min-w-0 break-words">{event.location}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              <AddToCalendar
                icsHref={`/c/${slug}/events/${event.id}/event.ics`}
                googleHref={googleCalendarUrl({
                  title: event.title,
                  description: event.description,
                  location: event.location,
                  start: occurrence.start,
                  end: occurrence.end,
                  url: pageUrl,
                })}
              />
              {detail.canManage && (
                <EventManage
                  communityId={data.community.id}
                  slug={slug}
                  eventId={event.id}
                  at={occurrence.start}
                  dateLabel={formatDay(occurrence.start, clock)}
                  repeats={Boolean(event.recurrence)}
                  cancelled={detail.seriesCancelled}
                  dateCancelled={detail.dateCancelled}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* First in reading order (answering comes before the details), on the right on wide screens. */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">
          <section aria-labelledby="answer-h" className={card}>
            <h3 id="answer-h" className="text-lg font-bold">
              {t('answerLabel')}
            </h3>
            {detail.canRsvp ? (
              <RsvpControl
                communityId={data.community.id}
                eventId={event.id}
                at={occurrence.start}
                initial={{ going: detail.going, maybe: detail.maybe, mine: detail.mine }}
                capacity={event.capacity}
                stacked
              />
            ) : (
              <>
                <p className="text-muted">
                  {detail.cancelled
                    ? t('cancelledShort')
                    : detail.ended
                      ? t('ended')
                      : !data.user
                        ? t('signInToAnswer')
                        : !data.ctx.isMember
                          ? t('joinToAnswer')
                          : t('cantAnswer')}
                </p>
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <p className="text-sm font-medium">{attendance}</p>
                  <PlacesBar taken={detail.going} capacity={event.capacity} />
                </div>
              </>
            )}
          </section>

          {otherDates.length > 0 && (
            <section aria-labelledby="dates-h" className={card}>
              <h3 id="dates-h" className="text-lg font-bold">
                {t('otherDates')}
              </h3>
              <ul className="-mx-2 flex flex-col">
                {otherDates.map((d) => {
                  const p = dateParts(d, clock);
                  const end = new Date(new Date(d).getTime() + length);
                  return (
                    <li key={d}>
                      <Link
                        href={occurrenceHref(slug, { eventId: event.id, start: d })}
                        className="flex items-center gap-3 rounded-ui p-2 transition-colors hover:bg-surface-2"
                      >
                        <DateTile month={p.month} day={p.day} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-sm font-semibold">
                            <span className="sr-only">{formatDay(d, clock)}</span>
                            <span aria-hidden>{weekday.format(new Date(d))}</span>
                          </span>
                          <span className="text-sm text-muted">
                            {formatTimes(d, end, event.allDay, clock) ?? t('allDay')}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {event.description && (
            <section aria-labelledby="about-h" className={card}>
              <h3 id="about-h" className="text-lg font-bold">
                {t('about')}
              </h3>
              <p className="leading-relaxed break-words whitespace-pre-wrap">{event.description}</p>
            </section>
          )}

          <section aria-labelledby="who-h" className={card}>
            <h3 id="who-h" className="text-lg font-bold">
              {t('whosGoing', { count: going.length })}
            </h3>
            {going.length ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {going.map((a) => (
                  <li
                    key={a.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-ui border border-border p-2"
                  >
                    <Avatar src={a.image} name={a.name} size={36} />
                    {a.username ? (
                      <Link
                        href={`/u/${a.username}`}
                        className="truncate font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{a.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">{t('noAttendees')}</p>
            )}
            {maybe.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-muted">
                  {t('maybeHeading', { count: maybe.length })}
                </h4>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {maybe.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <Avatar src={a.image} name={a.name} size={24} />
                      {a.username ? (
                        <Link href={`/u/${a.username}`} className="hover:underline">
                          {a.name}
                        </Link>
                      ) : (
                        a.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

const card = 'flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-5';
