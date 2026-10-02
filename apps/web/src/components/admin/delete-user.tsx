'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { deleteUserAction } from '@/app/actions/admin';

/** Delete someone's account for them. */
export function DeleteUser({ userId, handle }: { userId: string; handle: string }) {
  const t = useTranslations('admin.deleteUser');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [removeContent, setRemoveContent] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  return (
    <SettingsSection id="delete" title={t('title')} description={t('description')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await deleteUserAction(userId, { confirm, reason, removeContent });
          setPending(false);
          if (r.ok) {
            toast.success(t('done'));
            router.push('/admin/users');
          } else {
            setError(r.error);
            setFields(r.fields ?? {});
          }
        }}
      >
        <FormError message={error} />
        <Field label={t('reason')} error={fields.reason}>
          {(p) => (
            <Input
              {...p}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <SwitchField
          label={t('removeContent')}
          description={t('removeContentDesc')}
          checked={removeContent}
          onCheckedChange={setRemoveContent}
        />
        <Field label={t('confirm', { handle })} error={fields.confirm}>
          {(p) => (
            <Input
              {...p}
              value={confirm}
              autoComplete="off"
              autoCapitalize="none"
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button type="submit" variant="danger" loading={pending}>
            {t('delete')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
