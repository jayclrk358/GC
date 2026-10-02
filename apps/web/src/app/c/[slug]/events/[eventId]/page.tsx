import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, Repeat, Users } from 'lucide-react';
import { env, getEventDetail, isAppError } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { getViewerTimeZone } from '@/lib/timezone';
import { describeRecurrence, googleCalendarUrl } from '@/lib/events';
import { formatDay, formatEventRange, zoneName } from '@/lib/event-format';
import { Alert, Avatar } from '@/components/ui/misc';
import { BackLink } from '@/components/ui/back-link';
import { RsvpControl } from '@/components/events/rsvp-control';
import { EventManage } from '@/components/events/event-manage';
import { AddToCalendar } from '@/components/events/calendar-links';
import { TimezoneSync } from '@/components/events/timezone-sync';
import { occurrenceHref } from '@/components/events/event-list';

type Params = Promise<{ slug: string; eventId: string }>;

// Shared by the metadata and the page, so the event is loaded once per request.
const load = cache(async (slug: string, eventId: string, at?: string) => {
  const data = await loadCommunity(slug);
  try {
    const when = at ? new Date(at) : null;
    return { data, detail: await getEventDetail(data.ctx, eventId, when) };
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

  return (
    <article className="flex flex-col gap-6" aria-labelledby="event-title">
      <TimezoneSync serverZone={zone} />
      <BackLink href={`/c/${slug}/events`}>{t('allEvents')}</BackLink>

      {detail.cancelled && (
        <Alert tone="warning">
          {detail.seriesCancelled ? t('cancelledNotice') : t('dateCancelledNotice')}
        </Alert>
      )}

      <header className="flex flex-col gap-4">
        <h2 id="event-title" className="text-3xl font-bold">
          {event.title}
        </h2>
        <dl className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
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
            <div className="flex items-start gap-2">
              <dt>
                <Repeat aria-hidden className="mt-0.5 size-5 text-muted" />
                <span className="sr-only">{t('repeats')}</span>
              </dt>
              <dd>{repeats}</dd>
            </div>
          )}
          {event.location && (
            <div className="flex items-start gap-2">
              <dt>
                <MapPin aria-hidden className="mt-0.5 size-5 text-muted" />
                <span className="sr-only">{t('where')}</span>
              </dt>
              <dd>{event.location}</dd>
            </div>
          )}
          <div className="flex items-start gap-2">
            <dt>
              <Users aria-hidden className="mt-0.5 size-5 text-muted" />
              <span className="sr-only">{t('attendance')}</span>
            </dt>
            <dd>
              {event.capacity > 0
                ? detail.full
                  ? t('fullPlaces', { capacity: event.capacity })
                  : t('places', { taken: detail.going, capacity: event.capacity })
                : t('going', { count: detail.going })}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
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
      </header>

      {event.description && (
        <section aria-labelledby="about-h" className="flex flex-col gap-2">
          <h3 id="about-h" className="text-lg font-bold">
            {t('about')}
          </h3>
          <p className="break-words whitespace-pre-wrap">{event.description}</p>
        </section>
      )}

      <section aria-labelledby="answer-h" className="flex flex-col gap-3">
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
          />
        ) : (
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
        )}
      </section>

      {otherDates.length > 0 && (
        <section aria-labelledby="dates-h" className="flex flex-col gap-2">
          <h3 id="dates-h" className="text-lg font-bold">
            {t('otherDates')}
          </h3>
          <ul className="flex flex-col gap-1">
            {otherDates.map((d) => (
              <li key={d}>
                <Link
                  href={occurrenceHref(slug, { eventId: event.id, start: d })}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {formatEventRange(
                    d,
                    new Date(
                      new Date(d).getTime() +
                        (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()),
                    ),
                    event.allDay,
                    clock,
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="who-h" className="flex flex-col gap-3">
        <h3 id="who-h" className="text-lg font-bold">
          {t('whosGoing', { count: going.length })}
        </h3>
        {going.length ? (
          <ul className="flex flex-wrap gap-3">
            {going.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Avatar src={a.image} name={a.name} size={32} />
                {a.username ? (
                  <Link href={`/u/${a.username}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                ) : (
                  <span className="font-medium">{a.name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t('noAttendees')}</p>
        )}
        {maybe.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-muted">
              {t('maybeCount', { count: maybe.length })}
            </h4>
            <ul className="flex flex-wrap gap-3">
              {maybe.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-muted">
                  <Avatar src={a.image} name={a.name} size={24} />
                  {a.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </article>
  );
}
