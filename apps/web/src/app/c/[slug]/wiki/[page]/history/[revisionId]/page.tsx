import Link from '@/components/ui/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { canEditWiki, compareRevision, isAppError } from '@gamecentral/core';
import { formatDateTime } from '@/lib/format';
import { RichText } from '@/components/rich-text/rich-text';
import { RestoreRevisionButton } from '@/components/wiki/wiki-page-tools';
import { loadWikiPage } from '../../../_load';
import { BackLink } from '@/components/ui/back-link';

type Params = Promise<{ slug: string; page: string; revisionId: string }>;

export const metadata = { title: 'Revision' };

export default async function WikiRevisionPage({ params }: { params: Params }) {
  const { slug, page: pageSlug, revisionId } = await params;
  const { data, page } = await loadWikiPage(slug, pageSlug);
  const t = await getTranslations('wiki');
  const tBack = await getTranslations('common');
  const locale = await getLocale();
  let cmp: Awaited<ReturnType<typeof compareRevision>>;
  try {
    cmp = await compareRevision(data.ctx, page.id, revisionId);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  const { revision, previous, parts, titleChanged } = cmp;
  const pageHref = `/c/${slug}/wiki/${page.slug}`;
  const when = formatDateTime(revision.createdAt, 'auto', locale);
  const added = parts.filter((p) => p.kind === 'added').reduce((n, p) => n + p.text.length, 0);
  const removed = parts.filter((p) => p.kind === 'removed').reduce((n, p) => n + p.text.length, 0);
  const current = revision.id === page.currentRevisionId;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <BackLink href={`${pageHref}/history`}>{tBack('backTo', { name: t('history') })}</BackLink>
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={pageHref} className="hover:underline">
            {page.title}
          </Link>{' '}
          ›{' '}
          <Link href={`${pageHref}/history`} className="hover:underline">
            {t('history')}
          </Link>{' '}
          › {when}
        </nav>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t('revisionFrom', { date: when })}</h2>
          <p className="text-sm text-muted">
            {t('revisionBy', { name: revision.authorName ?? t('someone') })}
            {revision.summary ? ` — ${revision.summary}` : ''}
          </p>
        </div>
        {canEditWiki(data.ctx, page) && !current && (
          <RestoreRevisionButton
            communityId={data.community.id}
            pageId={page.id}
            revisionId={revision.id}
            pageHref={pageHref}
            label={t('restoreFrom', { date: when })}
          />
        )}
      </div>

      <section aria-labelledby="changes-h" className="flex flex-col gap-3">
        <h3 id="changes-h" className="text-lg font-bold">
          {previous ? t('changes') : t('firstVersion')}
        </h3>
        <p className="text-sm">
          <span className="font-semibold text-success">{t('charsAdded', { count: added })}</span>
          {' · '}
          <span className="font-semibold text-danger">{t('charsRemoved', { count: removed })}</span>
        </p>
        {titleChanged && previous && (
          <p className="text-sm">
            {t('titleChanged')} <del className="diff-del">{previous.title}</del> →{' '}
            <ins className="diff-ins">{revision.title}</ins>
          </p>
        )}
        <p className="text-xs text-muted">{t('diffLegend')}</p>
        <div className="rounded-ui border border-border bg-surface p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {parts.map((p, i) =>
            p.kind === 'added' ? (
              <ins key={i} className="diff-ins">
                <span className="sr-only">[{t('srAdded')}: </span>
                {p.text}
                <span className="sr-only">]</span>
              </ins>
            ) : p.kind === 'removed' ? (
              <del key={i} className="diff-del">
                <span className="sr-only">[{t('srRemoved')}: </span>
                {p.text}
                <span className="sr-only">]</span>
              </del>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </div>
      </section>

      <details className="rounded-ui border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">{t('showRendered')}</summary>
        <div className="mt-3">
          <RichText doc={revision.body} headingOffset={2} />
        </div>
      </details>
    </div>
  );
}
