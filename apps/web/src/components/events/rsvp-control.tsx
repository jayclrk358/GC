'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, HelpCircle, X } from 'lucide-react';
import type { RsvpStatus } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rsvpAction } from '@/app/actions/events';
import { PlacesBar } from './event-bits';

const ICONS = { going: Check, maybe: HelpCircle, declined: X } as const;

/** Going / Maybe / Can't go for one date of an event. Pressing your answer again takes it back. */
export function RsvpControl({
  communityId,
  eventId,
  at,
  initial,
  capacity,
  compact = false,
  stacked = false,
  label,
}: {
  communityId: string;
  eventId: string;
  /** The occurrence's start (ISO). */
  at: string;
  initial: { going: number; maybe: number; mine: RsvpStatus | null };
  capacity: number;
  compact?: boolean;
  /** Buttons sharing the width (in a narrow card). */
  stacked?: boolean;
  /** What the buttons are for, e.g. the event's name in a list. */
  label?: string;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const [state, setState] = React.useState(initial);
  const [pending, setPending] = React.useState<RsvpStatus | null>(null);
  // Fresh numbers from the server (after a refresh) replace ours.
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setState(initial);
  }
  const full = capacity > 0 && state.going >= capacity && state.mine !== 'going';

  async function answer(status: RsvpStatus) {
    const next = state.mine === status ? null : status;
    setPending(status);
    const r = await rsvpAction(communityId, eventId, at, next);
    setPending(null);
    if (r.ok) {
      setState(r.data);
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={label ? t('answerFor', { name: label }) : t('answerLabel')}
        className={cn(stacked ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-2')}
      >
        {(['going', 'maybe', 'declined'] as const).map((s) => {
          const Icon = ICONS[s];
          const on = state.mine === s;
          return (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={on ? 'primary' : 'outline'}
              className={cn(
                stacked && 'h-auto min-h-10 flex-col gap-1 px-1 py-2 whitespace-normal',
              )}
              aria-pressed={on}
              loading={pending === s}
              disabled={pending !== null || (s === 'going' && full)}
              onClick={() => void answer(s)}
            >
              <Icon aria-hidden /> {t(`answer.${s}`)}
            </Button>
          );
        })}
      </div>
      {!compact && capacity > 0 && (
        <span className="mt-1 block">
          <PlacesBar taken={state.going} capacity={capacity} />
        </span>
      )}
      {!compact && (
        <p className="text-sm text-muted" aria-live="polite">
          {t('going', { count: state.going })} · {t('maybeCount', { count: state.maybe })}
          {capacity > 0 && (
            <>
              {' · '}
              {state.going >= capacity
                ? t('fullPlaces', { capacity })
                : t('places', { taken: state.going, capacity })}
            </>
          )}
        </p>
      )}
    </div>
  );
}
