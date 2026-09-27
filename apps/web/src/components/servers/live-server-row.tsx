'use client';

import { useTranslations } from 'next-intl';
import type { ServerStatus } from '@magnox/shared';
import { StatusDot, useLiveStatus } from './server-status';

/** One compact line in the home page's "live now" panel. */
export function LiveServerRow({
  endpointId,
  name,
  protocolLabel,
  status: initial,
}: {
  endpointId: string;
  name: string;
  protocolLabel: string;
  status: ServerStatus;
}) {
  const t = useTranslations('servers');
  const th = useTranslations('home');
  const status = useLiveStatus(endpointId, initial);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot online={status.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="text-xs text-muted">
          {protocolLabel} · {status.online ? t('online') : t('offline')}
        </p>
      </div>
      {status.online && (
        <p className="font-heading text-sm font-semibold tabular-nums">
          {status.maxPlayers === null
            ? t('playing', { count: status.players ?? 0 })
            : th('playersOf', {
                players: status.players ?? 0,
                max: status.maxPlayers,
              })}
        </p>
      )}
    </div>
  );
}
