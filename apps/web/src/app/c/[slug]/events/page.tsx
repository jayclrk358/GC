import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays, CalendarRange, History, ListOrdered, Plus } from 'lucide-react';
import { listEventOccurrences, pastEvents, upcomingEvents } from '@gamecentral/core';
import { has, Permission, zonedToUtc } from '@gamecentral/shared';
import { loadCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { getViewerTimeZone } from '@/lib/timezone';
import { feedUrl } from '@/lib/events';
import { dayKey } from '@/lib/event-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { EventList } from '@/components/events/event-list';
import { monthGrid, MonthCalendar } from '@/components/events/month-calendar';
import { SubscribeFeed } from '@/components/events/calendar-links';
import { TimezoneSync } from '@/components/events/timezone-sync';

export const metadata = { title: 'Events' };

type View = 'upcoming' | 'past' | 'month';

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const view: View = sp.view === 'past' ? 'past' : sp.view === 'month' ? 'month' : 'upcoming';
  const [data, t, prefs, zone, locale] = await Promise.all([
    loadCommunity(slug),
    getTranslations('events'),
    getPrefs(),
    getViewerTimeZone(),
    getLocale(),
  ]);
  const { ctx, community } = data;
  const timeZone = zone ?? 'UTC';
  const clock = { timeZone, locale, timeFormat: prefs.timeFormat };
  const canManage = has(ctx.base, Permission.MANAGE_EVENTS);
  const canAnswer = ctx.isMember && has(ctx.base, Permission.RSVP_EVENTS);
  const today = dayKey(new Date(), timeZone);
  // Within ten years either way: further out there's nothing to show, only dates to work out
  // (and near the end of what JavaScript dates can hold, that fails).
  const asked = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? sp.month! : null;
  const month =
    asked && Math.abs(Number(asked.slice(0, 4)) - Number(today.slice(0, 4))) <= 10
      ? asked
      : today.slice(0, 7);
  const base = `/c/${slug}/events`;

  let body: React.ReactNode;
  if (view === 'month') {
    const weeks = monthGrid(month);
    const first = weeks[0]![0]!.key;
    const last = weeks.at(-1)!.at(-1)!.key;
    const [fy, fm, fd] = first.split('-').map(Number) as [number, number, number];
    const [ly, lm, ld] = last.split('-').map(Number) as [number, number, number];
    const from = zonedToUtc({ year: fy, month: fm, day: fd, hour: 0, minute: 0 }, timeZone);
    const end = zonedToUtc({ year: ly, month: lm, day: ld, hour: 0, minute: 0 }, timeZone);
    const occurrences = await listEventOccurrences(ctx, {
      from,
      to: new Date(end.getTime() + 86_400_000),
      limit: 500,
    });
    body = (
      <MonthCalendar
        month={month}
        occurrences={occurrences}
        slug={slug}
        clock={clock}
        today={today}
        hrefFor={(m) => `${base}?view=month&month=${m}`}
      />
    );
  } else {
    const occurrences = view === 'past' ? await pastEvents(ctx, 50) : await upcomingEvents(ctx, 50);
    body = occurrences.length ? (
      <EventList
        occurrences={occurrences}
        slug={slug}
        clock={clock}
        feature={view === 'upcoming'}
        rsvp={view === 'upcoming' && canAnswer ? { communityId: community.id } : null}
      />
    ) : (
      <EmptyState
        icon={<CalendarDays />}
        title={view === 'past' ? t('emptyPast') : t('empty')}
        description={view === 'upcoming' && canManage ? t('emptyManage') : undefined}
        action={
          view === 'upcoming' && canManage ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> {t('new')}
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const feed = feedUrl(community, ctx.userId, ctx.isMember);
  const tabs: { view: View; label: string; href: string; Icon: typeof History }[] = [
    { view: 'upcoming', label: t('upcoming'), href: base, Icon: ListOrdered },
    { view: 'past', label: t('past'), href: `${base}?view=past`, Icon: History },
    { view: 'month', label: t('month'), href: `${base}?view=month`, Icon: CalendarRange },
  ];
  const zoneLabel = timeZone.replaceAll('_', ' ');

  return (
    <div className="flex flex-col gap-6">
      <TimezoneSync serverZone={zone} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-sm text-muted">{t('timesIn', { zone: zoneLabel })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {feed && <SubscribeFeed feedUrl={feed} />}
          {canManage && (
            <Button asChild size="sm">
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> {t('new')}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <nav aria-label={t('viewsLabel')}>
        <ul className="inline-flex gap-1 rounded-ui border border-border bg-surface-2 p-1">
          {tabs.map(({ view: v, label, href, Icon }) => (
            <li key={v}>
              <Link
                href={href}
                aria-current={v === view ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-ui-sm px-3 py-1.5 text-sm font-semibold transition-colors',
                  v === view
                    ? 'bg-surface text-fg shadow-sm ring-1 ring-border'
                    : 'text-muted hover:bg-surface/60 hover:text-fg',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
