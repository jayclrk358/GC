import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getConsent } from '@magnox/core';
import { CURRENT_TERMS_VERSION } from '@magnox/shared';
import { requireUser } from '@/lib/auth';
import { AcceptTerms } from '@/components/legal/accept-terms';

export const metadata = { title: 'Terms', robots: { index: false } };

/** Only paths on this site, so the page can't send people elsewhere. */
const safeNext = (next: string | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const user = await requireUser('/accept-terms');
  const [consent, t] = await Promise.all([getConsent(user.id), getTranslations('legal')]);
  if (consent.termsVersion >= CURRENT_TERMS_VERSION) redirect(next);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold">
        {consent.termsVersion ? t('updatedTitle') : t('newTitle')}
      </h1>
      <AcceptTerms next={next} updated={consent.termsVersion > 0} />
    </div>
  );
}
