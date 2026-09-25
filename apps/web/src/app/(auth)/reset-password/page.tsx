import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetForm } from '@/components/auth/reset-form';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('resetTitle')}>
      <ResetForm token={error ? null : (token ?? null)} />
    </AuthCard>
  );
}
