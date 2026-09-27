import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Globe2, ShieldCheck, Users } from 'lucide-react';
import {
  endpointHistory,
  getServerDetail,
  isAppError,
  markEndpointsHot,
  type ServerDetail,
} from '@magnox/core';
import { formatDuration } from '@magnox/shared';
import { getUser } from '@/lib/auth';
import { turnstileSiteKey } from '@/lib/turnstile';
import { Alert, Badge } from '@/components/ui/misc';
import { ServerHistoryCharts } from '@/components/servers/history-charts';
import { LiveStatusPanel } from '@/components/servers/live-status-panel';
import { VotePanel } from '@/components/servers/server-detail';

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, userId: string | null): Promise<ServerDetail> {
  if (!UUID.test(id)) notFound();
  try {
    return await getServerDetail(id, userId);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
}

/** "5 h 10 min" from now until `iso` (or since it, for past times). */
function durationFrom(iso: string | null): string | null {
  return iso ? formatDuration(Math.abs(new Date(iso).getTime() - Date.now())) : null;
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const user = await getUser();
  const server = await load(id, user?.id ?? null);
  return {
    title: server.name,
    description: server.description || `${server.protocolLabel} server on Magnox`,
  };
}

export default async function ServerPage({ params }: Params) {
  const { id } = await params;
  const user = await getUser();
  const t = await getTranslations('serverPage');
  const tc = await getTranslations('community');
  const server = await load(id, user?.id ?? null);
  await markEndpointsHot([server.endpointId]);
  const history = await endpointHistory(server.endpointId, '24h');
  const wait = durationFrom(server.vote.nextVoteAt);
  const downFor = durationFrom(server.downSince);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link
        href="/servers"
        className="flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>

      <header className="flex flex-col gap-3">
        <p className="mx-eyebrow">
          {server.gameName ?? server.protocolLabel}
          {server.gameName && !server.protocolLabel.startsWith(server.gameName) && (
            <span className="text-muted"> · {server.protocolLabel}</span>
          )}
        </p>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold uppercase sm:text-4xl">
          {server.name}
          {server.verified && (
            <Badge tone="success">
              <ShieldCheck className="size-4" aria-hidden /> {t('verified')}
            </Badge>
          )}
        </h1>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {server.community && (
            <li>
              <Link
                href={`/c/${server.community.slug}`}
                className="flex items-center gap-1 font-semibold text-fg hover:underline"
              >
                <Users className="size-4" aria-hidden />
                {server.community.name}
              </Link>
            </li>
          )}
          {server.region !== 'global' && (
            <li className="flex items-center gap-1">
              <Globe2 className="size-4" aria-hidden />
              {tc(`regions.${server.region}`)}
            </li>
          )}
          {server.tags.map((tag) => (
            <li key={tag}>
              <Link
                href={`/servers?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary hover:text-fg"
              >
                #{tag}
              </Link>
            </li>
          ))}
        </ul>
      </header>

      {server.private && (
        <Alert tone="info" title={t('privateTitle')}>
          {t('privateBody')}
        </Alert>
      )}
      {server.dormant && <Alert tone="warning">{t('dormant')}</Alert>}
      {!server.dormant && downFor && (
        <Alert tone="warning">{t('downSince', { duration: downFor })}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {server.description && (
            <p className="text-lg whitespace-pre-line text-muted">{server.description}</p>
          )}
          <ServerHistoryCharts serverId={server.id} initial={history} />
        </div>
        <aside className="flex flex-col gap-4" aria-label={t('sidebar')}>
          <LiveStatusPanel
            endpointId={server.endpointId}
            initial={server.status}
            address={server.address}
            connectUrl={server.connectUrl}
          />
          {!server.private && (
            <VotePanel
              serverId={server.id}
              serverName={server.name}
              voteCount={server.voteCount}
              votesThisMonth={server.votesThisMonth}
              signedIn={Boolean(user)}
              emailVerified={Boolean(user?.emailVerified)}
              waitText={wait}
              rewards={server.rewards}
              turnstileSiteKey={await turnstileSiteKey()}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
