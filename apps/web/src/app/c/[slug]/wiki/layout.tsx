import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FilePlus2, Search } from 'lucide-react';
import { canEditWiki } from '@magnox/core';
import { loadWikiTree } from './_load';
import { loadCommunity } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WikiTree } from '@/components/wiki/wiki-tree';

export default async function WikiLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCommunity(slug);
  const t = await getTranslations('wiki');
  const tree = await loadWikiTree(slug);
  const base = `/c/${slug}/wiki`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside
        aria-label={t('sidebar')}
        className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start"
      >
        <form role="search" action={`${base}/search`} className="flex gap-1">
          <label htmlFor="wiki-q" className="sr-only">
            {t('searchLabel')}
          </label>
          <Input id="wiki-q" name="q" type="search" placeholder={t('searchPlaceholder')} />
          <Button type="submit" size="icon" variant="outline" aria-label={t('search')}>
            <Search aria-hidden />
          </Button>
        </form>
        {canEditWiki(data.ctx) && (
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/new`}>
              <FilePlus2 aria-hidden /> {t('newPage')}
            </Link>
          </Button>
        )}
        <nav aria-label={t('pages')}>
          <p aria-hidden className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('pages')}
          </p>
          {tree.length ? (
            <WikiTree base={base} nodes={tree} protectedLabel={t('protected')} />
          ) : (
            <p className="text-sm text-muted">{t('noPages')}</p>
          )}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
