'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { FormError } from './form-error';

export function ForgotForm() {
  const t = useTranslations('auth');
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    const res = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setPending(false);
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
      <Button type="submit" size="lg" loading={pending}>
        {t('sendResetLink')}
      </Button>
    </form>
  );
}
