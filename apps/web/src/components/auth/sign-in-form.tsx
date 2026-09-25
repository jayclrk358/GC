'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { syncPrefsFromAccount } from '@/app/actions/prefs';
import { FormError } from './form-error';

export function SignInForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const identifier = String(form.get('identifier') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const res = identifier.includes('@')
      ? await authClient.signIn.email({ email: identifier, password })
      : await authClient.signIn.username({ username: identifier, password });
    if (res.error) {
      setPending(false);
      setError(res.error.message ?? 'Invalid credentials');
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
      <Button type="submit" size="lg" loading={pending}>
        {t('signInCta')}
      </Button>
    </form>
  );
}
