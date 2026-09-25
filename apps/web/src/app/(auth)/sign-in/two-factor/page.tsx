import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { safeNext } from '@/lib/safe-redirect';

export const metadata = { title: 'Two-factor verification' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('twoFactorTitle')} subtitle={t('twoFactorSubtitle')}>
      <TwoFactorForm next={next} />
    </AuthCard>
  );
}
