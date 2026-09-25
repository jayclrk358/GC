'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

const LABELS: Record<string, string> = { discord: 'Discord', google: 'Google', twitch: 'Twitch' };

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
            onClick={() =>
              authClient.signIn.social({
                provider: p as 'discord' | 'google' | 'twitch',
                callbackURL: next,
              })
            }
          >
            {t('continueWith', { provider: LABELS[p] ?? p })}
          </Button>
        ))}
      </div>
    </div>
  );
}
