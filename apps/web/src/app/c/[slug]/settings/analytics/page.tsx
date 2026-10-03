import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { communityAnalytics } from '@gamecentral/core';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { DailyBars } from '@/components/analytics/daily-bars';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { perms, ctx } = await loadCommunityForSettings(slug);
  if (!perms.viewAnalytics) notFound();
  const [t, format, a] = await Promise.all([
    getTranslations('analytics'),
    getFormatter(),
    communityAnalytics(ctx),
  ]);
  const stats = [
    {
      label: t('stats.members'),
      value: a.totals.members,
      detail: t('stats.membersDetail', { week: a.totals.joined7, month: a.totals.joined30 }),
    },
    {
      label: t('stats.active'),
      value: a.totals.active7,
      detail: t('stats.activeDetail', { month: a.totals.active30 }),
    },
    {
      label: t('stats.messages'),
      value: a.totals.messages30,
      detail: t('stats.last30'),
    },
    {
      label: t('stats.posts'),
      value: a.totals.posts30,
      detail: t('stats.postsDetail', { threads: a.totals.threads30 }),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description', {
          time: format.dateTime(new Date(a.generatedAt), { timeStyle: 'short' }),
        })}
      />
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-ui-lg border border-border bg-surface p-4"
          >
            <dt className="text-sm font-semibold text-muted">{s.label}</dt>
            <dd className="text-3xl font-bold tabular-nums">{format.number(s.value)}</dd>
            <dd className="text-sm text-muted">{s.detail}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-3">
        <DailyBars id="joins" title={t('charts.joins')} days={a.days} values={a.joins} />
        <DailyBars id="messages" title={t('charts.messages')} days={a.days} values={a.messages} />
        <DailyBars id="posts" title={t('charts.posts')} days={a.days} values={a.posts} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-labelledby="top-channels"
          className="rounded-ui-lg border border-border bg-surface p-4"
        >
          <h2 id="top-channels" className="mb-3 font-bold">
            {t('topChannels')}
          </h2>
          {a.topChannels.length === 0 ? (
            <p className="text-sm text-muted">{t('quiet')}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {a.topChannels.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={
                      c.type === 'text'
                        ? `/c/${slug}/chat/${c.name}`
                        : `/c/${slug}/forum/${encodeURIComponent(c.name)}`
                    }
                    className="truncate font-semibold hover:underline"
                  >
                    {c.type === 'text' ? `#${c.name}` : c.name}
                  </Link>
                  <span className="text-muted tabular-nums">{t('posts', { count: c.count })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section
          aria-labelledby="top-members"
          className="rounded-ui-lg border border-border bg-surface p-4"
        >
          <h2 id="top-members" className="mb-3 font-bold">
            {t('topMembers')}
          </h2>
          {a.topMembers.length === 0 ? (
            <p className="text-sm text-muted">{t('quiet')}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {a.topMembers.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  {m.username ? (
                    <Link
                      href={`/u/${m.username}`}
                      className="truncate font-semibold hover:underline"
                    >
                      {m.name}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold">{m.name}</span>
                  )}
                  <span className="text-muted tabular-nums">{t('posts', { count: m.count })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
