import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotForm } from '@/components/auth/forgot-form';
import { turnstileSiteKey } from '@/lib/turnstile';

export const metadata = { title: 'Forgot password' };

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <ForgotForm turnstileSiteKey={await turnstileSiteKey()} />
    </AuthCard>
  );
}
