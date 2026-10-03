import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { adminFeedbackItem, isAppError } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { formatDateTime } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { PageHeader } from '@/components/ui/misc';
import {
  FeedbackKindBadge,
  FeedbackMessage,
  FeedbackStatusBadge,
} from '@/components/feedback/feedback-bits';
import { FeedbackPanel } from '@/components/admin/feedback-panel';

export const metadata = { title: 'Feedback' };

export default async function AdminFeedbackItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await staffFor('feedback');
  const [t, tf, locale] = await Promise.all([
    getTranslations('admin'),
    getTranslations('feedback'),
    getLocale(),
  ]);
  let item;
  try {
    item = await adminFeedbackItem(staff.id, id);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  const when = (iso: string) => (
    <span suppressHydrationWarning>{formatDateTime(iso, 'auto', locale)}</span>
  );
  const from = item.from?.name ?? t('feedback.deletedUser');
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/feedback">{t('feedback.back')}</BackLink>
      <PageHeader title={item.title} />
      <p className="flex flex-wrap items-center gap-2">
        <FeedbackKindBadge kind={item.kind} />
        <FeedbackStatusBadge status={item.status} />
      </p>
      <dl className="grid gap-x-6 gap-y-2 rounded-ui-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">{t('feedback.from')}</dt>
        <dd>
          {item.from ? (
            <Link href={`/admin/users/${item.from.id}`} className="hover:underline">
              {item.from.name}
              {item.from.username && ` (@${item.from.username})`} · {item.from.email}
            </Link>
          ) : (
            from
          )}
        </dd>
        <dt className="text-muted">{t('feedback.sent')}</dt>
        <dd>{when(item.createdAt)}</dd>
        <dt className="text-muted">{t('feedback.page')}</dt>
        <dd>
          {item.page ? (
            <Link href={item.page} className="break-all hover:underline">
              {item.page}
            </Link>
          ) : (
            '—'
          )}
        </dd>
        <dt className="text-muted">{t('feedback.browser')}</dt>
        <dd className="text-xs break-all">{item.userAgent ?? '—'}</dd>
      </dl>
      <ol className="flex flex-col gap-3" aria-label={tf('conversation')}>
        <FeedbackMessage author={from} date={when(item.createdAt)}>
          {item.body}
        </FeedbackMessage>
        {item.messages.map((m) => (
          <FeedbackMessage
            key={m.id}
            author={m.fromStaff ? `${tf('team')} · ${m.authorName ?? '—'}` : from}
            fromStaff={m.fromStaff}
            internal={m.internal}
            date={when(m.createdAt)}
          >
            {m.body}
          </FeedbackMessage>
        ))}
      </ol>
      <FeedbackPanel id={item.id} status={item.status} />
    </div>
  );
}
