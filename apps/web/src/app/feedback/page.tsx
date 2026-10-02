import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { myFeedback } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { SettingsSection } from '@/components/settings/section';
import { FeedbackForm } from '@/components/feedback/feedback-form';
import { FeedbackKindBadge, FeedbackStatusBadge } from '@/components/feedback/feedback-bits';

export async function generateMetadata() {
  const t = await getTranslations('feedback');
  return { title: t('title') };
}

/** Where they came from, if it's a page on this site. */
function samePagePath(from: string | undefined): string | null {
  return from && /^\/(?!\/)\S*$/.test(from) && from.length <= 300 && !from.startsWith('/feedback')
    ? from
    : null;
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ from }, user, t, locale] = await Promise.all([
    searchParams,
    getUser(),
    getTranslations('feedback'),
    getLocale(),
  ]);
  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <PageHeader title={t('title')} description={t('intro')} />
        <p>{t('signInFirst')}</p>
        <div>
          <Button asChild>
            <Link href="/sign-in?next=/feedback">{t('signIn')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  const mine = await myFeedback(user.id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <PageHeader title={t('title')} description={t('intro')} />
      <SettingsSection id="send" title={t('sendTitle')}>
        <FeedbackForm from={samePagePath(from)} />
      </SettingsSection>
      <SettingsSection id="mine" title={t('mineTitle')} description={t('mineDescription')}>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">{t('mineEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {mine.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <Link
                  href={`/feedback/${f.id}`}
                  className="min-w-0 flex-1 font-semibold hover:underline"
                >
                  {f.title}
                </Link>
                <FeedbackKindBadge kind={f.kind} />
                <FeedbackStatusBadge status={f.status} />
                <span className="w-full text-xs text-muted" suppressHydrationWarning>
                  {formatDateTime(f.createdAt, 'auto', locale)}
                  {f.replies > 0 && ` · ${t('replies', { count: f.replies })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
