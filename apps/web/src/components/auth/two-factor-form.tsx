'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import Link from '@/components/ui/link';
import { safeNext } from '@/lib/safe-redirect';
import { twoFactorError } from '@/lib/two-factor-errors';
import { syncPrefsFromAccount } from '@/app/actions/prefs';
import { FormError } from './form-error';

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const te = useTranslations('security.errors');
  const router = useRouter();
  const [backup, setBackup] = React.useState(false);
  const [trust, setTrust] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expired, setExpired] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s/g, '');
    const res = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: trust });
    if (res.error) {
      setPending(false);
      // Ten minutes are up, or too many wrong codes: only signing in again starts a new try.
      const code = res.error.code;
      setExpired(
        code === 'INVALID_TWO_FACTOR_COOKIE' || code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
      );
      setError(twoFactorError(te, res.error));
      return;
    }
    await syncPrefsFromAccount();
    router.push(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      {expired && (
        <Link
          href={`/sign-in?next=${encodeURIComponent(safeNext(next))}`}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t('signInAgain')}
        </Link>
      )}
      <Field
        label={backup ? t('backupCode') : t('code')}
        description={backup ? t('backupCodeHint') : undefined}
        required
      >
        {(p) => (
          <Input
            {...p}
            key={backup ? 'b' : 't'}
            name="code"
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            pattern={backup ? undefined : '[0-9 ]*'}
            required
            autoFocus
          />
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={trust}
          onChange={(e) => setTrust(e.target.checked)}
          className="size-4 accent-[var(--c-primary)]"
        />
        {t('trustDevice')}
      </label>
      <Button type="submit" size="lg" loading={pending}>
        {t('verify')}
      </Button>
      <Button type="button" variant="link" onClick={() => setBackup((b) => !b)}>
        {backup ? t('code') : t('useBackupCode')}
      </Button>
    </form>
  );
}
