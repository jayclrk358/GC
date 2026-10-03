import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { upcomingEvents } from '@gamecentral/core';
import type { BlockConfig } from '@gamecentral/shared';
import type { LoadedCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { getViewerTimeZone } from '@/lib/timezone';
import { EventList } from '@/components/events/event-list';
import { BlockSection } from './section';

/** The next few events, with a link to the rest. */
export async function UpcomingEventsBlock({
  id,
  config,
  data,
}: {
  id: string;
  config: BlockConfig<'upcomingEvents'>;
  data: LoadedCommunity;
}) {
  const [t, prefs, zone, locale, events] = await Promise.all([
    getTranslations('events'),
    getPrefs(),
    getViewerTimeZone(),
    getLocale(),
    upcomingEvents(data.ctx, config.count),
  ]);
  const base = `/c/${data.community.slug}/events`;
  if (!events.length && !data.perms.manage) return null;
  return (
    <BlockSection id={id} heading={config.heading}>
      {events.length === 0 ? (
        <p className="rounded-ui border border-dashed border-border p-4 text-muted">
          {t('blockEmpty')}
        </p>
      ) : (
        <EventList
          occurrences={events}
          slug={data.community.slug}
          clock={{ timeZone: zone ?? 'UTC', locale, timeFormat: prefs.timeFormat }}
        />
      )}
      <p>
        <Link href={base} className="font-semibold text-primary underline">
          {t('allEvents')}
        </Link>
      </p>
    </BlockSection>
  );
}
