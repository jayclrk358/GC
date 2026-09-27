import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@magnox/auth';
import { AuthCard } from '@/components/auth/auth-card';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { SocialButtons } from '@/components/auth/social-buttons';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-redirect';
import { turnstileSiteKey } from '@/lib/turnstile';

export const metadata = { title: 'Sign up' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  const t = await getTranslations('auth');
  return (
    <AuthCard
      title={t('signUpTitle')}
      subtitle={t('signUpSubtitle')}
      footer={
        <>
          {t('haveAccount')}{' '}
          <Link
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t('signInCta')}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <SignUpForm next={next} turnstileSiteKey={await turnstileSiteKey()} />
        <SocialButtons providers={enabledSocialProviders()} next={next} />
      </div>
    </AuthCard>
  );
}
