'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { suspendCommunityAction, unsuspendCommunityAction } from '@/app/actions/admin';

/** Take a community offline for breaking the rules, or bring it back. */
export function SuspendCommunityForm({
  communityId,
  suspended,
}: {
  communityId: string;
  suspended: boolean;
}) {
  const t = useTranslations('admin.suspend');
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  if (suspended) {
    return (
      <SettingsSection id="suspend" title={t('liftTitle')} description={t('liftDescription')}>
        <Button
          loading={pending}
          onClick={async () => {
            setPending(true);
            const r = await unsuspendCommunityAction(communityId);
            setPending(false);
            if (r.ok) {
              toast.success(t('lifted'));
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          {t('lift')}
        </Button>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection id="suspend" title={t('title')} description={t('description')}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await suspendCommunityAction(communityId, { reason });
          setPending(false);
          if (r.ok) {
            toast.success(t('done'));
            router.refresh();
          } else {
            setError(r.error);
            setFields(r.fields ?? {});
          }
        }}
      >
        <FormError message={error} />
        <Field label={t('reason')} description={t('reasonHint')} error={fields.reason}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button type="submit" variant="danger" loading={pending}>
            {t('suspend')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
