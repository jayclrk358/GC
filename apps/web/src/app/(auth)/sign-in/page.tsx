import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@gamecentral/auth';
import { AuthCard } from '@/components/auth/auth-card';
import { SignInForm } from '@/components/auth/sign-in-form';
import { SocialButtons } from '@/components/auth/social-buttons';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-redirect';
import { turnstileSiteKey } from '@/lib/turnstile';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  const t = await getTranslations('auth');
  return (
    <AuthCard
      title={t('signInTitle')}
      subtitle={t('signInSubtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link
            href={`/sign-up?next=${encodeURIComponent(next)}`}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t('signUpCta')}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <SignInForm next={next} turnstileSiteKey={await turnstileSiteKey()} />
        <SocialButtons providers={enabledSocialProviders()} next={next} />
      </div>
    </AuthCard>
  );
}
