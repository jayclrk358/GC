'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { giftPlanAction, removePlanGiftAction } from '@/app/actions/admin';
import { formatDateTime } from '@/lib/format';

/** Give a community Plus or Pro for free, for a while or for good. */
export function GiftPlanForm({
  communityId,
  gift,
}: {
  communityId: string;
  gift: { plan: string; expiresAt: string | null; note: string } | null;
}) {
  const t = useTranslations('admin.gift');
  const tp = useTranslations('admin.plans');
  const locale = useLocale();
  const router = useRouter();
  const [plan, setPlan] = React.useState(gift?.plan ?? 'pro');
  const [months, setMonths] = React.useState('0');
  const [note, setNote] = React.useState(gift?.note ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<'give' | 'remove' | null>(null);

  return (
    <SettingsSection id="gift" title={t('title')} description={t('description')}>
      {gift && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Gift className="size-4 text-primary" aria-hidden />
          <span suppressHydrationWarning>
            {gift.expiresAt
              ? t('currentUntil', {
                  plan: tp(gift.plan),
                  date: formatDateTime(gift.expiresAt, 'auto', locale),
                })
              : t('currentForever', { plan: tp(gift.plan) })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={pending === 'remove'}
            onClick={async () => {
              setPending('remove');
              const r = await removePlanGiftAction(communityId);
              setPending(null);
              if (r.ok) {
                toast.success(t('removed'));
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            {t('remove')}
          </Button>
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setPending('give');
          setError(null);
          const r = await giftPlanAction(communityId, { plan, months: Number(months), note });
          setPending(null);
          if (r.ok) {
            toast.success(t('given'));
            router.refresh();
          } else setError(r.error);
        }}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('plan')}>
            {(p) => (
              <Select {...p} value={plan} onValueChange={setPlan}>
                <option value="plus">{tp('plus')}</option>
                <option value="pro">{tp('pro')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('length')}>
            {(p) => (
              <Select {...p} value={months} onValueChange={setMonths}>
                <option value="0">{t('forever')}</option>
                <option value="1">{t('months', { count: 1 })}</option>
                <option value="3">{t('months', { count: 3 })}</option>
                <option value="6">{t('months', { count: 6 })}</option>
                <option value="12">{t('months', { count: 12 })}</option>
                <option value="24">{t('months', { count: 24 })}</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('note')} description={t('noteHint')}>
          {(p) => (
            <Input {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <div>
          <Button type="submit" loading={pending === 'give'}>
            <Gift aria-hidden /> {gift ? t('update') : t('give')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
