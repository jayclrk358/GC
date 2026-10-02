'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { removeContentAction } from '@/app/actions/admin';

/** Remove a message or post, with a reason for the record. */
export function RemoveContent({
  kind,
  id,
  opensThread,
  label,
}: {
  kind: 'message' | 'post';
  id: string;
  opensThread: boolean;
  /** What it is, for screen readers ("Remove Sam's message"). */
  label: string;
}) {
  const t = useTranslations('admin.content');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={label}>
          <Trash2 aria-hidden /> {t('remove')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={opensThread ? t('removeThreadTitle') : t('removeTitle')}
        description={opensThread ? t('removeThreadDescription') : t('removeDescription')}
        size="sm"
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            const r = await removeContentAction({ kind, id, reason });
            setPending(false);
            if (r.ok) {
              toast.success(t('removed'));
              setOpen(false);
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t('remove')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
