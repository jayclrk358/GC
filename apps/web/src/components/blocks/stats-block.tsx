import { getLocale, getTranslations } from 'next-intl/server';
import { countOnlineServers, onlineInCommunity } from '@magnox/core';
import type { BlockConfig } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { formatCount } from '@/lib/utils';
import { BlockSection } from './section';

export async function StatsBlock({
  id,
  config,
  data,
}: {
  id: string;
  config: BlockConfig<'stats'>;
  data: LoadedCommunity;
}) {
  const [t, locale, online, servers] = await Promise.all([
    getTranslations('blocks.statsLabels'),
    getLocale(),
    config.showOnline ? onlineInCommunity(data.community.id) : Promise.resolve(0),
    config.showServers
      ? countOnlineServers(data.community.id)
      : Promise.resolve({ total: 0, online: 0, players: 0 }),
  ]);
  const items: { label: string; value: string }[] = [];
  if (config.showMembers)
    items.push({ label: t('members'), value: formatCount(data.community.memberCount, locale) });
  if (config.showOnline) items.push({ label: t('online'), value: formatCount(online, locale) });
  if (config.showServers && servers.total) {
    items.push({ label: t('serversOnline'), value: `${servers.online} / ${servers.total}` });
    items.push({ label: t('players'), value: formatCount(servers.players, locale) });
  }
  if (!items.length) return null;
  return (
    <BlockSection id={id} heading={config.heading || undefined}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div
            key={i.label}
            className="flex flex-col-reverse rounded-ui border border-border bg-surface p-4"
          >
            <dt className="text-sm text-muted">{i.label}</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{i.value}</dd>
          </div>
        ))}
      </dl>
    </BlockSection>
  );
}
