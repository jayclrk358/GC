'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell, BellOff } from 'lucide-react';
import { MUTE_DURATIONS } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setMuteAction } from '@/app/actions/notifications';

/** Mute notifications from a community or channel for a while or until unmuted. */
export function MuteMenu({
  targetType,
  targetId,
  name,
  muted: initial,
  iconOnly,
  compact,
}: {
  targetType: 'community' | 'channel';
  targetId: string;
  name: string;
  muted: boolean;
  iconOnly?: boolean;
  /** A plain small icon, for toolbars like chat's header. */
  compact?: boolean;
}) {
  const t = useTranslations('notifications');
  const [muted, setMuted] = React.useState(initial);

  async function apply(seconds: number | null) {
    const next = seconds !== null;
    const r = await setMuteAction({ targetType, targetId, seconds: seconds ?? 0 }, next);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setMuted(next);
    toast.success(next ? t('mutedToast', { name }) : t('unmutedToast', { name }));
  }

  const label = muted ? t('mutedLabel', { name }) : t('muteLabel', { name });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size={compact ? 'icon-sm' : iconOnly ? 'icon' : 'sm'}
          aria-label={iconOnly ? label : undefined}
          title={compact ? label : undefined}
          className={compact ? 'text-muted hover:text-fg' : undefined}
        >
          {muted ? <BellOff aria-hidden /> : <Bell aria-hidden />}
          {!iconOnly && (muted ? t('muted') : t('mute'))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t(`muteFor.${targetType}`)}</DropdownMenuLabel>
        {(Object.keys(MUTE_DURATIONS) as (keyof typeof MUTE_DURATIONS)[]).map((k) => (
          <DropdownMenuItem key={k} onSelect={() => void apply(MUTE_DURATIONS[k])}>
            {t(`durations.${k}`)}
          </DropdownMenuItem>
        ))}
        {muted && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void apply(null)}>{t('unmute')}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
