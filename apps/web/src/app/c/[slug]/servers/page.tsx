import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Server } from 'lucide-react';
import { listCommunityServers, markEndpointsHot } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ServerCard } from '@/components/servers/server-status';

export const metadata = { title: 'Servers' };

export default async function CommunityServersPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadCommunity((await params).slug);
  const t = await getTranslations('servers');
  const servers = await listCommunityServers(data.community.id);
  await markEndpointsHot(servers.map((s) => s.endpointId));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        {data.perms.manageServers && (
          <Button asChild variant="outline">
            <Link href={`/c/${data.community.slug}/settings/servers`}>{t('manage')}</Link>
          </Button>
        )}
      </div>
      {servers.length === 0 ? (
        <EmptyState icon={<Server />} title={t('none')} description={data.perms.manageServers ? t('noneManage') : undefined} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((s) => (
            <li key={s.id} className="flex">
              <div className="flex-1">
                <ServerCard server={s} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
