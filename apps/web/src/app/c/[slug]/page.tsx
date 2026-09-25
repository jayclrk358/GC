import { listBlocks } from '@magnox/core';
import { getTranslations } from 'next-intl/server';
import { loadCommunity } from '@/lib/community';
import { BlockList } from '@/components/blocks/block-list';
import { Alert, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LayoutTemplate } from 'lucide-react';

export default async function CommunityHome({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const data = await loadCommunity((await params).slug);
  const { created } = await searchParams;
  const t = await getTranslations('community');
  const blocks = await listBlocks(data.community.id);
  if (blocks.length === 0) {
    return (
      <EmptyState
        icon={<LayoutTemplate />}
        title={t('emptyPage')}
        description={data.perms.manage ? t('emptyPageManage') : undefined}
        action={
          data.perms.manage ? (
            <Button asChild>
              <Link href={`/c/${data.community.slug}/settings/page`}>{t('editPage')}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {created && data.perms.manage && (
        <Alert tone="success" live title={t('created')}>
          <Link href={`/c/${data.community.slug}/settings/appearance`} className="font-semibold underline">
            {t('customise')}
          </Link>
        </Alert>
      )}
      <BlockList blocks={blocks} data={data} />
    </div>
  );
}
