import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { canEditWiki, listWikiTree } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { WikiEditor } from '@/components/wiki/wiki-editor';
import { parentOptions } from '@/components/wiki/tree-utils';

export const metadata = { title: 'New wiki page' };

export default async function NewWikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ parent?: string }>;
}) {
  const { slug } = await params;
  const data = await loadCommunity(slug);
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(`/c/${slug}/wiki/new`)}`);
  if (!canEditWiki(data.ctx)) notFound();
  const t = await getTranslations('wiki');
  const parents = parentOptions(await listWikiTree(data.ctx));
  const parent = (await searchParams).parent;
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold">{t('newPage')}</h2>
      <WikiEditor
        communityId={data.community.id}
        slug={slug}
        parents={parents}
        defaultParentId={parents.some((p) => p.id === parent) ? parent : null}
        requireAlt={Boolean(data.community.settings.requireAltText)}
      />
    </div>
  );
}
