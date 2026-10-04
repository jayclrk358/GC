'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { PROVIDER_LABELS, ProviderIcon } from './provider-icons';

/** Game Central for Windows marks its user agent (see apps/desktop/src/main.ts). */
const inDesktopApp = () => navigator.userAgent.includes('GameCentralDesktop/');

/** Sign in with Discord, Google or Twitch, then come back to `next`. */
export function startSocialSignIn(provider: string, next: string) {
  // In the Windows app, the app takes this over and signs in through the browser. A full page
  // load (not the router), since that's what the app watches for.
  if (inDesktopApp()) {
    const query = new URLSearchParams({ provider, next });
    window.location.assign(new URL(`/desktop/sign-in?${query}`, window.location.origin));
    return;
  }
  void authClient.signIn.social({
    provider: provider as 'discord' | 'google' | 'twitch',
    callbackURL: next,
  });
}

export function SocialButtons({ providers, next }: { providers: string[]; next: string }) {
  const t = useTranslations('auth');
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        {t('orContinueWith')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {providers.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            onClick={() => startSocialSignIn(p, next)}
          >
            <ProviderIcon provider={p} className="size-[18px]!" />
            {t('continueWith', { provider: PROVIDER_LABELS[p] ?? p })}
          </Button>
        ))}
      </div>
    </div>
  );
}
