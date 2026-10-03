'use client';

import * as React from 'react';
import Link from '@/components/ui/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { PROVIDER_LABELS, ProviderIcon } from './provider-icons';

/**
 * Marks that this tab went off to sign in for the app, so it carries on by itself when it comes
 * back signed in. Only this page sets it: someone sent here by a link has to press the button.
 */
const STARTED = 'gc-desktop-sign-in';

function startedHere(challenge: string): boolean {
  try {
    const started = sessionStorage.getItem(STARTED) === challenge;
    sessionStorage.removeItem(STARTED);
    return started;
  } catch {
    return false;
  }
}

function markStarted(challenge: string) {
  try {
    sessionStorage.setItem(STARTED, challenge);
  } catch {
    // Private windows can refuse storage: they'll just press "Open Game Central" themselves.
  }
}

/** A one-time code for the app, for the account signed in here (null if that failed). */
async function requestCode(challenge: string): Promise<string | null> {
  const res = await fetch('/api/auth/desktop/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { code?: unknown } | null;
  return res?.ok && typeof data?.code === 'string' ? data.code : null;
}

type Stage = 'idle' | 'leaving' | 'opening' | 'opened' | 'error';

const noSubscribe = () => () => {};

export function DesktopSignIn({
  provider,
  challenge,
  next,
  failed,
  user,
}: {
  provider: string | null;
  challenge: string | null;
  next: string;
  failed: boolean;
  user: { name: string; username: string | null } | null;
}) {
  const t = useTranslations('desktopAuth');
  const ta = useTranslations('auth');
  // Straight off to the provider unless they're signed in here already (or it just failed).
  const [stage, setStage] = React.useState<Stage>(
    failed ? 'error' : !challenge || (!user && provider) ? 'leaving' : 'idle',
  );
  const [error, setError] = React.useState<string | null>(failed ? t('didntFinish') : null);
  const ran = React.useRef(false);
  // The buttons do nothing until the page's script has loaded, so they wait for it.
  const ready = React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const label = provider ? (PROVIDER_LABELS[provider] ?? provider) : '';
  // Back here once signed in (the provider adds ?error=… if it went wrong).
  const here = challenge
    ? `/desktop/sign-in?${new URLSearchParams({ ...(provider ? { provider } : {}), challenge })}`
    : null;

  const goToProvider = React.useCallback(() => {
    if (!provider) return;
    if (challenge) markStarted(challenge);
    void authClient.signIn.social({
      provider: provider as 'discord' | 'google' | 'twitch',
      callbackURL: here ?? next,
      errorCallbackURL: here ?? undefined,
    });
  }, [provider, challenge, here, next]);

  const signInWithProvider = () => {
    setStage('leaving');
    goToProvider();
  };

  /** Give the app a one-time code for the account signed in here. */
  /** Hand the app the one-time code (or say it went wrong). */
  const finish = React.useCallback(
    (code: string | null) => {
      if (!code) {
        setStage('error');
        setError(t('handoffFailed'));
        return;
      }
      window.location.href = `gamecentral://auth?code=${encodeURIComponent(code)}`;
      setStage('opened');
    },
    [t],
  );

  const openApp = () => {
    if (!challenge) return;
    setStage('opening');
    setError(null);
    void requestCode(challenge).then(finish);
  };

  React.useEffect(() => {
    if (ran.current || failed) return;
    ran.current = true;
    // Shown inside an older app: sign in right here, as it always did.
    if (!challenge) return goToProvider();
    if (!user) {
      if (provider) goToProvider();
    } else if (startedHere(challenge)) {
      void requestCode(challenge).then(finish);
    }
  }, [challenge, user, provider, failed, goToProvider, finish]);

  if (!challenge || stage === 'leaving') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 text-center text-muted">
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        {t('goingTo', { provider: label })}
      </p>
    );
  }

  if (stage === 'opened') {
    return (
      <div className="flex flex-col gap-4 text-center">
        <Alert tone="success" live title={t('openedTitle')}>
          {t('openedBody')}
        </Alert>
        <p className="text-sm text-muted">{t('notOpening')}</p>
        <Button variant="outline" onClick={openApp} disabled={!ready}>
          {t('openAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="danger" live>
          {error}
        </Alert>
      )}
      {user ? (
        <>
          <p className="text-center">
            {t.rich('signedInAs', {
              name: user.name,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
            {user.username && <span className="block text-sm text-muted">@{user.username}</span>}
          </p>
          <Button onClick={openApp} loading={stage === 'opening'} disabled={!ready}>
            {t('openAs', { name: user.name })}
          </Button>
          {provider && (
            <Button variant="outline" onClick={signInWithProvider} disabled={!ready}>
              <ProviderIcon provider={provider} className="size-[18px]!" />
              {t('useProviderInstead', { provider: label })}
            </Button>
          )}
        </>
      ) : provider ? (
        <Button variant="outline" onClick={signInWithProvider} disabled={!ready}>
          <ProviderIcon provider={provider} className="size-[18px]!" />
          {ta('continueWith', { provider: label })}
        </Button>
      ) : (
        <Button asChild>
          <Link href={`/sign-in?next=${encodeURIComponent(here ?? '/')}`}>{t('signInFirst')}</Link>
        </Button>
      )}
    </div>
  );
}
