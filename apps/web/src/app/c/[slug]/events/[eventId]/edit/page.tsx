import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getEventDetail, isAppError } from '@magnox/core';
import { has, Permission } from '@magnox/shared';
import { loadCommunity } from '@/lib/community';
import { eventValues } from '@/lib/event-form-values';
import { BackLink } from '@/components/ui/back-link';
import { EventForm } from '@/components/events/event-form';

export const metadata = { title: 'Edit event' };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const [data, t] = await Promise.all([loadCommunity(slug), getTranslations('events')]);
  if (!has(data.ctx.base, Permission.MANAGE_EVENTS)) notFound();
  let detail;
  try {
    detail = await getEventDetail(data.ctx, eventId);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href={`/c/${slug}/events/${eventId}`}>{detail.event.title}</BackLink>
      <h2 className="text-2xl font-bold">{t('form.editTitle')}</h2>
      <EventForm
        communityId={data.community.id}
        eventId={eventId}
        initial={eventValues(detail.event)}
      />
    </div>
  );
}
