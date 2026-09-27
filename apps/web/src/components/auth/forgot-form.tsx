'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Turnstile, type TurnstileHandle } from '@/components/ui/turnstile';
import { authClient } from '@/lib/auth-client';
import { captchaOptions, isCaptchaError } from './captcha';
import { FormError } from './form-error';

export function ForgotForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const t = useTranslations('auth');
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    const res = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
      fetchOptions: captchaOptions(captcha),
    });
    setPending(false);
    if (res.error) turnstile.current?.reset();
    if (res.error && isCaptchaError(res.error)) {
      setError(t('captchaFailed'));
      return;
    }
    if (res.error && res.error.status === 429) {
      setError(res.error.message ?? 'Too many requests.');
      return;
    }
    // Always show the same message so the form can't be used to discover accounts.
    setDone(true);
  }

  if (done)
    return (
      <Alert tone="success" live>
        {t('resetSent')}
      </Alert>
    );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={t('email')} required>
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" required autoFocus />}
      </Field>
      {turnstileSiteKey && (
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          action="password-reset"
          onToken={setCaptcha}
        />
      )}
      <Button type="submit" size="lg" loading={pending}>
        {t('sendResetLink')}
      </Button>
    </form>
  );
}
