import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminFeedbackList } from '@gamecentral/core';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES } from '@gamecentral/shared';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/misc';
import { AdminSearch } from '@/components/admin/search-form';
import { FeedbackKindBadge, FeedbackStatusBadge } from '@/components/feedback/feedback-bits';

export const metadata = { title: 'Feedback' };

type SP = { status?: string; kind?: string; q?: string };

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const staff = await staffFor('feedback');
  const [t, tf, locale, data] = await Promise.all([
    getTranslations('admin'),
    getTranslations('feedback'),
    getLocale(),
    adminFeedbackList(staff.id, sp),
  ]);
  const status = sp.status ?? 'open';
  const kind = sp.kind ?? 'all';
  const href = (patch: SP) => {
    const next = { status, kind, q: sp.q ?? '', ...patch };
    const params = new URLSearchParams(
      Object.entries(next).filter(
        ([k, v]) => v && !(k === 'kind' && v === 'all') && !(k === 'status' && v === 'open'),
      ),
    );
    const qs = params.toString();
    return qs ? `/admin/feedback?${qs}` : '/admin/feedback';
  };
  const open = (data.counts.new ?? 0) + (data.counts.planned ?? 0) + (data.counts.in_progress ?? 0);
  const tabs = [
    { id: 'open', label: t('feedback.open'), n: open },
    ...FEEDBACK_STATUSES.map((s) => ({ id: s, label: tf(`status.${s}`), n: data.counts[s] ?? 0 })),
    { id: 'all', label: t('feedback.all'), n: null },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('feedback.title')} description={t('feedback.description')} />
      <nav aria-label={t('feedback.byStatus')}>
        <ul className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <Link
                href={href({ status: tab.id })}
                aria-current={status === tab.id ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold',
                  status === tab.id
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border hover:bg-surface-2',
                )}
              >
                {tab.label}
                {tab.n !== null && <span className="tabular-nums opacity-80">{tab.n}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label={t('feedback.byKind')}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(['all', ...FEEDBACK_KINDS] as const).map((k) => (
            <li key={k}>
              <Link
                href={href({ kind: k })}
                aria-current={kind === k ? 'page' : undefined}
                className={cn(
                  'rounded-ui px-2 py-1 hover:underline',
                  kind === k && 'bg-surface-2 font-semibold',
                )}
              >
                {k === 'all' ? t('feedback.allKinds') : tf(`kinds.${k}.short`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <AdminSearch
        label={t('feedback.search')}
        button={t('search')}
        defaultValue={sp.q ?? ''}
        keep={{ status, kind }}
      />
      {data.items.length === 0 ? (
        <p className="rounded-ui-lg border border-border bg-surface p-4 text-sm text-muted">
          {t('feedback.none')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface">
          {data.items.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/feedback/${f.id}`}
                  className="min-w-0 flex-1 font-semibold hover:underline"
                >
                  {f.title}
                </Link>
                <FeedbackKindBadge kind={f.kind} />
                <FeedbackStatusBadge status={f.status} />
              </div>
              <p className="text-xs text-muted">
                {f.from ? (
                  <Link href={`/admin/users/${f.from.id}`} className="hover:underline">
                    {f.from.name}
                    {f.from.username && ` (@${f.from.username})`}
                  </Link>
                ) : (
                  t('feedback.deletedUser')
                )}{' '}
                ·{' '}
                <span suppressHydrationWarning>{formatDateTime(f.createdAt, 'auto', locale)}</span>
                {f.replies > 0 && ` · ${tf('replies', { count: f.replies })}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
