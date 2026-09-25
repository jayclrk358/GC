'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { syncPrefsFromAccount } from '@/app/actions/prefs';
import { FormError } from './form-error';

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [backup, setBackup] = React.useState(false);
  const [trust, setTrust] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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
      setError(res.error.message ?? 'Invalid code');
      return;
    }
    await syncPrefsFromAccount();
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={backup ? t('backupCode') : t('code')} required>
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
