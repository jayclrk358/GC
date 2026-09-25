import { getTranslations } from 'next-intl/server';
import { Server } from 'lucide-react';
import { listPublicServers, markEndpointsHot } from '@magnox/core';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ServerCard } from '@/components/servers/server-status';

export const metadata = { title: 'Server browser' };

export default async function ServersPage() {
  const t = await getTranslations('servers');
  const servers = await listPublicServers({ limit: 60 });
  await markEndpointsHot(servers.map((s) => s.endpointId));
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
      <PageHeader title={t('browserTitle')} description={t('browserDescription')} />
      {servers.length === 0 ? (
        <EmptyState icon={<Server />} title={t('browserEmpty')} />
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
