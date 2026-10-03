'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { banUserAction, revokeSessionsAction, unbanUserAction } from '@/app/actions/admin';

/** Ban someone from Game Central (or lift a ban), and sign them out everywhere. */
export function UserActions({ userId, banned }: { userId: string; banned: boolean }) {
  const t = useTranslations('admin.ban');
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState('0');
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<string | null>(null);

  async function run(kind: string, fn: () => ReturnType<typeof unbanUserAction>, ok: string) {
    setPending(kind);
    const r = await fn();
    setPending(null);
    if (r.ok) {
      toast.success(ok);
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <>
      <SettingsSection
        id="sessions"
        title={t('sessionsTitle')}
        description={t('sessionsDescription')}
      >
        <Button
          variant="outline"
          loading={pending === 'revoke'}
          onClick={() => void run('revoke', () => revokeSessionsAction(userId), t('revoked'))}
        >
          {t('revoke')}
        </Button>
      </SettingsSection>
      {banned ? (
        <SettingsSection id="ban" title={t('liftTitle')}>
          <Button
            loading={pending === 'unban'}
            onClick={() => void run('unban', () => unbanUserAction(userId), t('lifted'))}
          >
            {t('lift')}
          </Button>
        </SettingsSection>
      ) : (
        <SettingsSection id="ban" title={t('title')} description={t('description')}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setPending('ban');
              setError(null);
              const r = await banUserAction(userId, { reason, days: Number(days) });
              setPending(null);
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
            <Field label={t('reason')} error={fields.reason}>
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
            <Field label={t('length')}>
              {(p) => (
                <Select {...p} value={days} onValueChange={setDays}>
                  <option value="0">{t('forever')}</option>
                  <option value="1">{t('days', { count: 1 })}</option>
                  <option value="7">{t('days', { count: 7 })}</option>
                  <option value="30">{t('days', { count: 30 })}</option>
                  <option value="365">{t('days', { count: 365 })}</option>
                </Select>
              )}
            </Field>
            <div>
              <Button type="submit" variant="danger" loading={pending === 'ban'}>
                {t('ban')}
              </Button>
            </div>
          </form>
        </SettingsSection>
      )}
    </>
  );
}
