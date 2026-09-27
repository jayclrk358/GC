'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Turnstile, type TurnstileHandle } from '@/components/ui/turnstile';
import { authClient } from '@/lib/auth-client';
import { syncPrefsFromAccount } from '@/app/actions/prefs';
import { captchaOptions, isCaptchaError } from './captcha';
import { FormError } from './form-error';

export function SignInForm({
  next,
  turnstileSiteKey,
}: {
  next: string;
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const turnstile = React.useRef<TurnstileHandle>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (turnstileSiteKey && !captcha) {
      setError(t('captchaRequired'));
      return;
    }
    setPending(true);
    const form = new FormData(e.currentTarget);
    const identifier = String(form.get('identifier') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const fetchOptions = captchaOptions(captcha);
    const res = identifier.includes('@')
      ? await authClient.signIn.email({ email: identifier, password, fetchOptions })
      : await authClient.signIn.username({ username: identifier, password, fetchOptions });
    if (res.error) {
      setPending(false);
      // Each token works once, so every failed attempt needs a fresh check.
      turnstile.current?.reset();
      setError(
        isCaptchaError(res.error)
          ? t('captchaFailed')
          : (res.error.message ?? 'Invalid credentials'),
      );
      return;
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return;
    await syncPrefsFromAccount();
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <Field label={t('emailOrUsername')} required>
        {(p) => <Input {...p} name="identifier" autoComplete="username" required autoFocus />}
      </Field>
      <Field label={t('password')} required>
        {(p) => (
          <Input {...p} name="password" type="password" autoComplete="current-password" required />
        )}
      </Field>
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          {t('forgotPassword')}
        </Link>
      </div>
      {turnstileSiteKey && (
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          action="sign-in"
          onToken={setCaptcha}
        />
      )}
      <Button type="submit" size="lg" loading={pending}>
        {t('signInCta')}
      </Button>
    </form>
  );
}
