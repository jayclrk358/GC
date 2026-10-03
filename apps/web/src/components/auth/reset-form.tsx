'use client';

import * as React from 'react';
import Link from '@/components/ui/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { FormError } from './form-error';

export function ResetForm({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!token) return <Alert tone="danger">{t('invalidToken')}</Alert>;
  if (done)
    return (
      <Alert tone="success" live>
        {t('resetDone')}{' '}
        <Link href="/sign-in" className="font-semibold underline">
          {t('signInCta')}
        </Link>
      </Alert>
    );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newPassword = String(new FormData(e.currentTarget).get('password') ?? '');
    if (newPassword.length < 10) {
      setError(t('passwordHint'));
      return;
    }
    setPending(true);
    const res = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (res.error) setError(res.error.message ?? t('invalidToken'));
    else setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={t('newPassword')} description={t('passwordHint')} required>
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            autoFocus
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        {t('updatePassword')}
      </Button>
    </form>
  );
}
