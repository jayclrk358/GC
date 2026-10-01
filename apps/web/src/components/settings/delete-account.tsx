'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { deleteAccountAction } from '@/app/actions/account';

/** Delete the account for good. */
export function DeleteAccount({
  confirmWord,
  owned,
}: {
  /** What they type to confirm: their username, or their email without one. */
  confirmWord: string;
  owned: { id: string; name: string; slug: string }[];
}) {
  const t = useTranslations('account.delete');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState('');
  const [removeContent, setRemoveContent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <SettingsSection id="delete" title={t('title')} description={t('description')}>
      {owned.length > 0 ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>{t('ownsFirst')}</p>
          <ul className="flex flex-col gap-1">
            {owned.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}/settings/danger`}
                  className="font-semibold text-primary underline"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            const r = await deleteAccountAction({ confirm, removeContent });
            setPending(false);
            if (!r.ok) return setError(r.error);
            router.replace('/?accountDeleted=1');
            router.refresh();
          }}
        >
          <FormError message={error} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--c-primary)]"
              checked={removeContent}
              onChange={(e) => setRemoveContent(e.target.checked)}
            />
            <span>
              <span className="font-semibold">{t('removeContent')}</span>
              <span className="block text-muted">{t('removeContentHint')}</span>
            </span>
          </label>
          <Field label={t('confirmLabel', { word: confirmWord })}>
            {(p) => (
              <Input
                {...p}
                value={confirm}
                autoComplete="off"
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </Field>
          <div>
            <Button
              type="submit"
              variant="danger"
              loading={pending}
              disabled={confirm.trim().toLowerCase() !== confirmWord.toLowerCase()}
            >
              {t('button')}
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}
