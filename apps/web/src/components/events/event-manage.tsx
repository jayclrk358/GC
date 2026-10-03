'use client';

import * as React from 'react';
import Link from '@/components/ui/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, CalendarX, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cancelEventAction, cancelOccurrenceAction, deleteEventAction } from '@/app/actions/events';

type Confirm = 'date' | 'event' | 'delete' | null;

/** Organisers' controls on an event page: edit, call off a date or the event, delete. */
export function EventManage({
  communityId,
  slug,
  eventId,
  at,
  dateLabel,
  repeats,
  cancelled,
  dateCancelled,
}: {
  communityId: string;
  slug: string;
  eventId: string;
  at: string;
  dateLabel: string;
  repeats: boolean;
  /** The whole event is called off. */
  cancelled: boolean;
  /** This date is called off. */
  dateCancelled: boolean;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    const r =
      confirm === 'date'
        ? await cancelOccurrenceAction(communityId, eventId, at)
        : confirm === 'event'
          ? await cancelEventAction(communityId, eventId)
          : await deleteEventAction(communityId, eventId);
    setPending(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(confirm === 'delete' ? t('deleted') : t('cancelledToast'));
    setConfirm(null);
    if (confirm === 'delete') router.push(`/c/${slug}/events`);
    // Stay on the date that was called off (the page otherwise moves on to the next one).
    else if (confirm === 'date') {
      router.replace(`/c/${slug}/events/${eventId}?at=${encodeURIComponent(at)}`);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/c/${slug}/events/${eventId}/edit`}>
          <Pencil aria-hidden /> {t('edit')}
        </Link>
      </Button>
      {repeats && !cancelled && !dateCancelled && (
        <Button variant="outline" size="sm" onClick={() => setConfirm('date')}>
          <CalendarX aria-hidden /> {t('cancelDate')}
        </Button>
      )}
      {!cancelled && (
        <Button variant="outline" size="sm" onClick={() => setConfirm('event')}>
          <Ban aria-hidden /> {t('cancelEvent')}
        </Button>
      )}
      <Button variant="danger" size="sm" onClick={() => setConfirm('delete')}>
        <Trash2 aria-hidden /> {t('delete')}
      </Button>
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm && (
          <DialogContent
            size="sm"
            title={
              confirm === 'date'
                ? t('cancelDate')
                : confirm === 'event'
                  ? t('cancelEvent')
                  : t('deleteTitle')
            }
            description={
              confirm === 'date'
                ? t('cancelDateConfirm', { date: dateLabel })
                : confirm === 'event'
                  ? t('cancelEventConfirm', { repeats: String(repeats) })
                  : t('deleteConfirm')
            }
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                {t('keep')}
              </Button>
              <Button variant="danger" loading={pending} onClick={() => void run()}>
                {confirm === 'delete' ? t('delete') : t('confirmCancel')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
