'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { deleteCommunityAction } from '@/app/actions/communities';

export function DeleteCommunity({ communityId, slug }: { communityId: string; slug: string }) {
  const t = useTranslations('csettings');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <SettingsSection id="delete" title={t('danger.deleteTitle')} description={t('danger.deleteDesc')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const r = await deleteCommunityAction(communityId, confirm);
          setPending(false);
          if (r.ok) {
            router.push('/');
            router.refresh();
          } else setError(r.error);
        }}
      >
        <FormError message={error} />
        <Field label={t('danger.confirmLabel', { slug })}>
          {(p) => <Input {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}
        </Field>
        <div>
          <Button type="submit" variant="danger" disabled={confirm !== slug} loading={pending}>
            {t('danger.deleteButton')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
