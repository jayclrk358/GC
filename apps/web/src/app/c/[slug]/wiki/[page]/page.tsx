import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FilePlus2, History, Lock, Pencil } from 'lucide-react';
import { canEditWiki, listWikiTree, type WikiTreeNode } from '@magnox/core';
import { docHeadings, has, Permission } from '@magnox/shared';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { RichText } from '@/components/rich-text/rich-text';
import { WikiPageTools } from '@/components/wiki/wiki-page-tools';
import { loadWikiPage } from '../_load';

type Params = Promise<{ slug: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, page } = await params;
  return { title: (await loadWikiPage(slug, page)).page.title };
}

function findNode(nodes: WikiTreeNode[], id: string): WikiTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export default async function WikiPageView({ params }: { params: Params }) {
  const { slug, page: pageSlug } = await params;
  const { data, page } = await loadWikiPage(slug, pageSlug);
  const t = await getTranslations('wiki');
  const tree = await listWikiTree(data.ctx);
  const node = findNode(tree, page.id);
  const parent = page.parentId ? findNode(tree, page.parentId) : null;
  const headings = docHeadings(page.body);
  const canEdit = canEditWiki(data.ctx, page);
  const canManage = data.ctx.isMember && has(data.ctx.base, Permission.MANAGE_WIKI);
  const base = `/c/${slug}/wiki`;

  return (
    <article aria-labelledby="wiki-title" className="flex flex-col gap-5">
      {parent && (
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={`${base}/${parent.slug}`} className="hover:underline">
            {parent.title}
          </Link>{' '}
          › {page.title}
        </nav>
      )}
      <header className="flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="wiki-title" className="text-3xl font-bold break-words">
            {page.title}
          </h2>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button asChild size="sm">
                <Link href={`${base}/${page.slug}/edit`}>
                  <Pencil aria-hidden /> {t('edit')}
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/${page.slug}/history`}>
                <History aria-hidden /> {t('history')}
              </Link>
            </Button>
            {canManage && (
              <WikiPageTools
                communityId={data.community.id}
                pageId={page.id}
                protectedPage={page.protected}
                title={page.title}
              />
            )}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {page.protected && (
            <Badge tone="warning">
              <Lock className="size-3" aria-hidden /> {t('protected')}
            </Badge>
          )}
          <span>
            {t('lastEdited', { name: page.editorName ?? t('someone') })}{' '}
            <time dateTime={page.updatedAt.toISOString()} title={formatDateTime(page.updatedAt)}>
              {relativeTime(page.updatedAt)}
            </time>
          </span>
        </p>
      </header>

      {headings.length >= 3 && (
        <nav
          aria-labelledby="toc-h"
          className="rounded-ui border border-border bg-surface p-4 text-sm"
        >
          <h3 id="toc-h" className="mb-2 font-bold">
            {t('contents')}
          </h3>
          <ol className="flex flex-col gap-1">
            {headings.map((h) => (
              <li key={h.id} style={{ paddingInlineStart: `${(h.level - 2) * 1}rem` }}>
                <a href={`#${h.id}`} className="text-primary hover:underline">
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <RichText doc={page.body} headingOffset={1} anchors />

      {node && node.children.length > 0 && (
        <section
          aria-labelledby="subpages-h"
          className="rounded-ui border border-border bg-surface p-4"
        >
          <h3 id="subpages-h" className="mb-2 font-bold">
            {t('subpages')}
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {node.children.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/${c.slug}`} className="text-primary hover:underline">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEditWiki(data.ctx) && (
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`${base}/new?parent=${page.id}`}>
              <FilePlus2 aria-hidden /> {t('addSubpage')}
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}
