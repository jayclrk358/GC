import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminContent } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/misc';
import { ContentFilters } from '@/components/admin/content-filters';
import { RemoveContent } from '@/components/admin/remove-content';

export const metadata = { title: 'Content' };

type SP = { q?: string; kind?: string; author?: string; community?: string };

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const staff = await staffFor('content');
  const [t, locale, items] = await Promise.all([
    getTranslations('admin.content'),
    getLocale(),
    adminContent(staff.id, sp),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <ContentFilters values={sp} />
      {items.length === 0 ? (
        <p className="rounded-ui-lg border border-border bg-surface p-4 text-sm text-muted">
          {t('none')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {items.map((c) => {
            const author = c.author?.name ?? t('deletedUser');
            return (
              <li key={`${c.kind}-${c.id}`} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>
                    {c.kind === 'message'
                      ? t('kinds.message')
                      : c.opensThread
                        ? t('thread')
                        : t('reply')}
                  </Badge>
                  {c.author ? (
                    <Link
                      href={`/admin/users/${c.author.id}`}
                      className="font-semibold hover:underline"
                    >
                      {author}
                    </Link>
                  ) : (
                    <span className="font-semibold">{author}</span>
                  )}
                  <span className="text-muted">
                    {t('in', { community: c.community.name, channel: c.channel })}
                  </span>
                  <span className="text-xs text-muted" suppressHydrationWarning>
                    {formatDateTime(c.createdAt, 'auto', locale)}
                  </span>
                </div>
                {c.threadTitle && c.opensThread && <p className="font-semibold">{c.threadTitle}</p>}
                <p className="text-sm whitespace-pre-wrap">{c.excerpt || t('noText')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={c.url}>{t('open')}</Link>
                  </Button>
                  <RemoveContent
                    kind={c.kind}
                    id={c.id}
                    opensThread={c.opensThread}
                    label={t('removeLabel', { name: author })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
