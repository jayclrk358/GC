import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { isAppError, myFeedbackItem } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { PageHeader } from '@/components/ui/misc';
import {
  FeedbackKindBadge,
  FeedbackMessage,
  FeedbackStatusBadge,
} from '@/components/feedback/feedback-bits';
import { FeedbackReply } from '@/components/feedback/feedback-form';

export async function generateMetadata() {
  const t = await getTranslations('feedback');
  return { title: t('title') };
}

export default async function FeedbackItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=/feedback/${encodeURIComponent(id)}`);
  const [t, locale] = await Promise.all([getTranslations('feedback'), getLocale()]);
  let item;
  try {
    item = await myFeedbackItem(user.id, id);
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
  const when = (iso: string) => (
    <span suppressHydrationWarning>{formatDateTime(iso, 'auto', locale)}</span>
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <BackLink href="/feedback">{t('backToFeedback')}</BackLink>
      <PageHeader title={item.title} />
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <FeedbackKindBadge kind={item.kind} />
        <FeedbackStatusBadge status={item.status} />
        <span className="text-muted">{t(`statusHelp.${item.status}`)}</span>
      </p>
      <ol className="flex flex-col gap-3" aria-label={t('conversation')}>
        <FeedbackMessage author={t('you')} date={when(item.createdAt)}>
          {item.body}
          {item.page && (
            <span className="mt-2 block text-xs text-muted">
              {t('sentFrom')}{' '}
              <Link href={item.page} className="underline">
                {item.page}
              </Link>
            </span>
          )}
        </FeedbackMessage>
        {item.messages.map((m) => (
          <FeedbackMessage
            key={m.id}
            author={m.fromStaff ? t('team') : t('you')}
            fromStaff={m.fromStaff}
            date={when(m.createdAt)}
          >
            {m.body}
          </FeedbackMessage>
        ))}
      </ol>
      <FeedbackReply feedbackId={item.id} />
    </div>
  );
}
