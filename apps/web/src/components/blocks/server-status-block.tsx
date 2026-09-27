import Link from 'next/link';
import { getServersByIds, listCommunityServers, markEndpointsHot } from '@magnox/core';
import type { BlockConfig } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { ServerCard } from '@/components/servers/server-status';
import { BlockSection } from './section';

export async function ServerStatusBlock({
  id,
  config,
  data,
}: {
  id: string;
  config: BlockConfig<'serverStatus'>;
  data: LoadedCommunity;
}) {
  const servers = config.serverIds.length
    ? await getServersByIds(data.community.id, config.serverIds)
    : await listCommunityServers(data.community.id);
  if (!servers.length) {
    if (!data.perms.manageServers) return null;
    return (
      <BlockSection id={id} heading={config.heading}>
        <p className="rounded-ui border border-dashed border-border p-4 text-muted">
          No servers linked yet.{' '}
          <Link
            href={`/c/${data.community.slug}/settings/servers`}
            className="font-semibold text-primary underline"
          >
            Add a server
          </Link>{' '}
          to show its live status here.
        </p>
      </BlockSection>
    );
  }
  await markEndpointsHot(servers.map((s) => s.endpointId));
  return (
    <BlockSection id={id} heading={config.heading}>
      <ul
        className={
          config.layout === 'list'
            ? 'flex flex-col gap-3'
            : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {servers.map((s) => (
          <li key={s.id} className="flex">
            <div className="flex-1">
              <ServerCard
                server={s}
                showPlayers={config.showPlayers}
                href={s.listed && s.verified ? `/servers/${s.id}` : undefined}
              />
            </div>
          </li>
        ))}
      </ul>
    </BlockSection>
  );
}
