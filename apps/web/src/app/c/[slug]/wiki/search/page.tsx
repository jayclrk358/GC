import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { searchWiki } from '@magnox/core';
import { loadCommunity } from '@/lib/community';

export const metadata = { title: 'Search the wiki' };

/** «» mark the matched words in snippets from Postgres ts_headline. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(«[^»]*»)/g)
        .map((part, i) =>
          part.startsWith('«') ? (
            <mark key={i}>{part.slice(1, -1)}</mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
    </>
  );
}

export default async function WikiSearch({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const q = ((await searchParams).q ?? '').trim();
  const data = await loadCommunity(slug);
  const t = await getTranslations('wiki');
  const results = q ? await searchWiki(data.ctx, q) : [];
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{q ? t('resultsFor', { q }) : t('search')}</h2>
      <p role="status" className="text-sm text-muted">
        {q ? t('resultCount', { count: results.length }) : t('searchHint')}
      </p>
      {results.length > 0 && (
        <ol className="flex flex-col gap-3">
          {results.map((r) => (
            <li key={r.slug} className="rounded-ui border border-border bg-surface p-4">
              <Link
                href={`/c/${slug}/wiki/${r.slug}`}
                className="font-bold text-primary hover:underline"
              >
                {r.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                <Snippet text={r.snippet} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
