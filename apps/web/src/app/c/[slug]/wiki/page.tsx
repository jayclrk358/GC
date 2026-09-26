import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BookOpen } from 'lucide-react';
import { canEditWiki, listWikiTree } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'Wiki' };

export default async function WikiIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadCommunity(slug);
  const tree = await listWikiTree(data.ctx);
  const home = tree.find((n) => n.slug === 'home') ?? tree[0];
  if (home) redirect(`/c/${slug}/wiki/${home.slug}`);
  const t = await getTranslations('wiki');
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{t('title')}</h2>
      <EmptyState
        icon={<BookOpen />}
        title={t('empty')}
        description={canEditWiki(data.ctx) ? t('emptyEdit') : undefined}
        action={
          canEditWiki(data.ctx) ? (
            <Button asChild>
              <Link href={`/c/${slug}/wiki/new`}>{t('newPage')}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
