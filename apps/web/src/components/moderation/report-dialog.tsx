'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-cards';
import { FormError } from '@/components/auth/form-error';
import { reportAction } from '@/app/actions/forum';

const REASONS = [
  'spam',
  'harassment',
  'hate',
  'nsfw',
  'violence',
  'misinformation',
  'other',
] as const;
type Reason = (typeof REASONS)[number];

export function ReportDialog({
  open,
  onOpenChange,
  communityId,
  targetType,
  targetId,
  what,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  communityId: string;
  targetType: 'post' | 'thread' | 'user' | 'wiki_page';
  targetId: string;
  what: string;
}) {
  const t = useTranslations('report');
  const [reason, setReason] = React.useState<Reason>('spam');
  const [details, setDetails] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title', { what })} description={t('description')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const r = await reportAction(communityId, { targetType, targetId, reason, details });
            setPending(false);
            if (r.ok) {
              onOpenChange(false);
              setDetails('');
              toast.success(t('sent'));
            } else setError(r.error);
          }}
        >
          <FormError message={error} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('reason')}</legend>
            <RadioCards
              label={t('reason')}
              value={reason}
              onValueChange={setReason}
              columns={2}
              options={REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
            />
          </fieldset>
          <Field label={t('details')} description={t('detailsHint')}>
            {(p) => (
              <Textarea
                {...p}
                value={details}
                maxLength={1000}
                onChange={(e) => setDetails(e.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
