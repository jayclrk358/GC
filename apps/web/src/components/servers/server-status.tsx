'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Copy, ExternalLink, Play, ShieldCheck, ThumbsUp, Users } from 'lucide-react';
import { isLinkProtocol, type ServerStatus } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { useRoom } from '@/lib/realtime';
import { cn } from '@/lib/utils';

export interface ServerCardData {
  id: string;
  endpointId: string;
  name: string;
  description: string;
  protocol: string;
  protocolLabel: string;
  address: string;
  connectUrl: string | null;
  verified: boolean;
  tags: string[];
  status: ServerStatus;
}

/** Keep a server's status in sync with the realtime feed. */
export function useLiveStatus(endpointId: string, initial: ServerStatus): ServerStatus {
  const [status, setStatus] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setStatus(initial);
  }
  useRoom(`server:${endpointId}`, {
    'server:status': (payload: { endpointId: string; status: ServerStatus }) => {
      if (payload.endpointId === endpointId) setStatus(payload.status);
    },
  });
  return status;
}

export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  // Shape differs as well as colour, so status never relies on colour alone.
  return online ? (
    <span aria-hidden className={cn('inline-block size-2.5 rounded-full bg-success', className)} />
  ) : (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 rotate-45 border-2 border-danger', className)}
    />
  );
}

/** Opens a Roblox experience in the Roblox app. */
export function PlayButton({ href, name }: { href: string; name: string }) {
  const t = useTranslations('servers');
  return (
    <Button asChild size="sm" variant="play">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('playOnRoblox', { name })}
      >
        <Play aria-hidden className="fill-current" /> {t('play')}
      </a>
    </Button>
  );
}

export function CopyAddress({ address }: { address: string }) {
  const t = useTranslations('servers');
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={t('copyAddress', { address })}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span className="font-mono">{address}</span>
      <span role="status" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
    </Button>
  );
}

export function ServerCard({
  server,
  showPlayers = true,
  href,
  community,
  votes,
  tagHrefs,
}: {
  server: ServerCardData;
  showPlayers?: boolean;
  /** Link the name to the server's page. */
  href?: string;
  community?: { slug: string; name: string } | null;
  votes?: number;
  /** Filter links for the tags, by tag (plain data, so server pages can pass it). */
  tagHrefs?: Record<string, string>;
}) {
  const t = useTranslations('servers');
  const status = useLiveStatus(server.endpointId, server.status);
  const checked = status.checkedAt !== null;
  const stateText = !checked ? t('checking') : status.online ? t('online') : t('offline');
  const fill =
    status.online && status.players !== null && status.maxPlayers
      ? Math.min(100, (status.players / status.maxPlayers) * 100)
      : 0;

  return (
    <article
      aria-labelledby={`srv-${server.id}`}
      className="mx-card flex h-full flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`srv-${server.id}`} className="flex items-center gap-1.5 truncate font-bold">
            {href ? (
              <Link href={href} prefetch={false} className="truncate hover:underline">
                {server.name}
              </Link>
            ) : (
              server.name
            )}
            {server.verified && (
              <ShieldCheck
                className="size-4 shrink-0 text-success"
                aria-label={t('verified')}
                role="img"
              />
            )}
          </h3>
          <p className="text-sm text-muted">{server.protocolLabel}</p>
        </div>
        <Badge
          tone={!checked ? 'neutral' : status.online ? 'success' : 'danger'}
          aria-live="polite"
        >
          <StatusDot online={status.online} className={!checked ? 'opacity-40' : undefined} />
          {stateText}
        </Badge>
      </header>

      {showPlayers && status.online && status.maxPlayers === null && (
        <p className="flex justify-between text-sm">
          <span>{t('players')}</span>
          <span className="font-semibold tabular-nums">
            {t('playing', { count: status.players ?? 0 })}
          </span>
        </p>
      )}
      {showPlayers && status.online && status.maxPlayers !== null && (
        <div>
          <p className="flex justify-between text-sm">
            <span>{t('players')}</span>
            <span className="font-semibold tabular-nums">
              {status.players ?? '?'} / {status.maxPlayers ?? '?'}
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
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${fill}%` }}
            />
          </div>
        </div>
      )}

      {(status.map || status.version) && status.online && (
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

      {server.description && <p className="text-sm text-muted">{server.description}</p>}

      {(community || votes !== undefined || (tagHrefs && server.tags.length > 0)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          {community && (
            <Link
              href={`/c/${community.slug}`}
              prefetch={false}
              className="flex items-center gap-1 font-medium text-fg hover:underline"
            >
              <Users className="size-4" aria-hidden />
              {community.name}
            </Link>
          )}
          {votes !== undefined && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-4" aria-hidden />
              {t('votes', { count: votes })}
            </span>
          )}
          {tagHrefs && server.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label={t('tags')}>
              {server.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={tagHrefs[tag] ?? `/servers?tag=${encodeURIComponent(tag)}`}
                    prefetch={false}
                    className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary hover:text-fg"
                  >
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {isLinkProtocol(server.protocol) && server.connectUrl ? (
          <PlayButton href={server.connectUrl} name={server.name} />
        ) : (
          <CopyAddress address={server.address} />
        )}
        {server.connectUrl && !isLinkProtocol(server.protocol) && (
          <Button asChild size="sm" variant="outline">
            <a href={server.connectUrl}>
              <ExternalLink aria-hidden /> {t('connect')}
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
