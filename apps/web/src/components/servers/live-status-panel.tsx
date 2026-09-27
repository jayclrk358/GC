'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import type { ServerStatus } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { CopyAddress, StatusDot, useLiveStatus } from './server-status';

/** Status, players and join details, kept live over the socket. */
export function LiveStatusPanel({
  endpointId,
  initial,
  address,
  connectUrl,
}: {
  endpointId: string;
  initial: ServerStatus;
  address: string;
  connectUrl: string | null;
}) {
  const t = useTranslations('servers');
  const status = useLiveStatus(endpointId, initial);
  const checked = status.checkedAt !== null;
  const fill =
    status.online && status.players !== null && status.maxPlayers
      ? Math.min(100, (status.players / status.maxPlayers) * 100)
      : 0;
  return (
    <div className="flex flex-col gap-4 rounded-ui-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge
          tone={!checked ? 'neutral' : status.online ? 'success' : 'danger'}
          aria-live="polite"
        >
          <StatusDot online={status.online} className={!checked ? 'opacity-40' : undefined} />
          {!checked ? t('checking') : status.online ? t('online') : t('offline')}
        </Badge>
        {status.online && status.pingMs !== null && (
          <span className="text-sm text-muted">{t('ping', { ms: status.pingMs })}</span>
        )}
      </div>
      {status.online && (
        <div>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted">{t('players')}</span>
            <span className="font-heading text-2xl font-bold">
              {status.players ?? '?'}
              <span className="text-base text-muted"> / {status.maxPlayers ?? '?'}</span>
            </span>
          </p>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"
            role="meter"
            aria-label={t('players')}
            aria-valuemin={0}
            aria-valuemax={status.maxPlayers ?? 0}
            aria-valuenow={status.players ?? 0}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
          </div>
        </div>
      )}
      {status.online && (status.map || status.version) && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {status.map && (
            <div>
              <dt className="text-muted">{t('map')}</dt>
              <dd className="truncate font-medium">{status.map}</dd>
            </div>
          )}
          {status.version && (
            <div>
              <dt className="text-muted">{t('version')}</dt>
              <dd className="truncate font-medium">{status.version}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyAddress address={address} />
        {connectUrl && (
          <Button asChild size="sm">
            <a href={connectUrl}>
              <ExternalLink aria-hidden /> {t('connect')}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
