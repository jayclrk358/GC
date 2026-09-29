import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { canEditWiki } from '@magnox/core';
import { WikiEditor } from '@/components/wiki/wiki-editor';
import { parentOptions } from '@/components/wiki/tree-utils';
import { loadWikiPage, loadWikiTree } from '../../_load';
import { BackLink } from '@/components/ui/back-link';

type Params = Promise<{ slug: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, page } = await params;
  return { title: `Edit ${(await loadWikiPage(slug, page)).page.title}` };
}

export default async function EditWikiPage({ params }: { params: Params }) {
  const { slug, page: pageSlug } = await params;
  const { data, page } = await loadWikiPage(slug, pageSlug);
  if (!data.user)
    redirect(`/sign-in?next=${encodeURIComponent(`/c/${slug}/wiki/${page.slug}/edit`)}`);
  if (!canEditWiki(data.ctx, page)) notFound();
  const t = await getTranslations('wiki');
  const tBack = await getTranslations('common');
  const parents = parentOptions(await loadWikiTree(slug), page.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <BackLink href={`/c/${slug}/wiki/${page.slug}`}>
          {tBack('backTo', { name: page.title })}
        </BackLink>
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={`/c/${slug}/wiki/${page.slug}`} className="hover:underline">
            {page.title}
          </Link>{' '}
          › {t('edit')}
        </nav>
      </div>
      <h2 className="text-2xl font-bold">{t('editing', { title: page.title })}</h2>
      <WikiEditor
        communityId={data.community.id}
        slug={slug}
        page={{
          id: page.id,
          title: page.title,
          body: page.body,
          parentId: page.parentId,
          currentRevisionId: page.currentRevisionId,
        }}
        parents={parents}
        requireAlt={Boolean(data.community.settings.requireAltText)}
      />
    </div>
  );
}
