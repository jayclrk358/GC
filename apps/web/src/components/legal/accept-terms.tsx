'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/auth/form-error';
import { acceptTermsAction } from '@/app/actions/account';

/** Agreeing to the terms (and being old enough), for people who haven't yet. */
export function AcceptTerms({ next, updated }: { next: string; updated: boolean }) {
  const t = useTranslations('legal');
  const router = useRouter();
  const [agreed, setAgreed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!agreed) return setError(t('tickFirst'));
        setPending(true);
        const r = await acceptTermsAction();
        setPending(false);
        if (!r.ok) return setError(r.error);
        router.replace(next);
        router.refresh();
      }}
    >
      <p>{updated ? t('updatedBody') : t('newBody')}</p>
      <FormError message={error} />
      <label className="flex items-start gap-2 font-semibold">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--c-primary)]"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            setError(null);
          }}
        />
        <span>
          {t.rich('agree', {
            terms: (c) => (
              <Link href="/legal/terms" target="_blank" className="text-primary underline">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/legal/privacy" target="_blank" className="text-primary underline">
                {c}
              </Link>
            ),
          })}
        </span>
      </label>
      <div>
        <Button type="submit" loading={pending}>
          {t('continue')}
        </Button>
      </div>
    </form>
  );
}
