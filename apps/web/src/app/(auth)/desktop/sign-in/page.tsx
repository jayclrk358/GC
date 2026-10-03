import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@gamecentral/auth';
import { AuthCard } from '@/components/auth/auth-card';
import { DesktopSignIn } from '@/components/auth/desktop-sign-in';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-redirect';

export const metadata = { title: 'Sign in to the app', robots: { index: false } };

/** What the Windows app's sign-in link carries: SHA-256 of a secret only the app knows. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Signing in to Game Central for Windows with Discord, Google or Twitch. The app opens this page
 * in the computer's browser (with `challenge`), where people are usually signed in to those
 * already; once they're signed in here, the browser hands the app a one-time code. Without a
 * challenge it's an older app showing this page itself, which signs in right here as before.
 */
export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; challenge?: string; next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const provider =
    typeof params.provider === 'string' && enabledSocialProviders().includes(params.provider)
      ? params.provider
      : null;
  const challenge =
    typeof params.challenge === 'string' && CHALLENGE.test(params.challenge)
      ? params.challenge
      : null;
  const next = safeNext(params.next);
  const user = await getUser();
  if (!challenge && (user || !provider)) redirect(next);
  const t = await getTranslations('desktopAuth');
  return (
    <AuthCard title={t('title')} subtitle={challenge ? t('subtitle') : undefined}>
      <DesktopSignIn
        provider={provider}
        challenge={challenge}
        next={next}
        failed={typeof params.error === 'string'}
        user={user ? { name: user.name, username: user.username ?? null } : null}
      />
    </AuthCard>
  );
}
