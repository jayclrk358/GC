import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { has, Permission } from '@gamecentral/shared';
import { loadCommunity } from '@/lib/community';
import { getViewerTimeZone } from '@/lib/timezone';
import { newEventValues } from '@/lib/event-form-values';
import { BackLink } from '@/components/ui/back-link';
import { EventForm } from '@/components/events/event-form';

export const metadata = { title: 'New event' };

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, t, zone] = await Promise.all([
    loadCommunity(slug),
    getTranslations('events'),
    getViewerTimeZone(),
  ]);
  if (!has(data.ctx.base, Permission.MANAGE_EVENTS)) notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href={`/c/${slug}/events`}>{t('allEvents')}</BackLink>
      <h2 className="text-2xl font-bold">{t('form.newTitle')}</h2>
      <EventForm communityId={data.community.id} initial={newEventValues(zone ?? 'UTC')} />
    </div>
  );
}
