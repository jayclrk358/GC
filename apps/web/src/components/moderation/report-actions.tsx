'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { resolveReportAction } from '@/app/actions/moderation';
import { deletePostAction } from '@/app/actions/forum';

export function ReportActions({
  communityId,
  reportId,
  deletablePostId,
}: {
  communityId: string;
  reportId: string;
  /** Set when the report is about a post that still exists and the moderator may remove it. */
  deletablePostId: string | null;
}) {
  const t = useTranslations('reports');
  const router = useRouter();
  const [mode, setMode] = React.useState<'resolved' | 'dismissed' | null>(null);
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [removeContent, setRemoveContent] = React.useState(false);

  async function submit() {
    if (!mode) return;
    setPending(true);
    if (removeContent && deletablePostId) {
      const d = await deletePostAction(communityId, deletablePostId);
      if (!d.ok) {
        setPending(false);
        toast.error(d.error);
        return;
      }
    }
    const r = await resolveReportAction(communityId, reportId, { status: mode, resolution: note });
    setPending(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(mode === 'resolved' ? t('resolvedToast') : t('dismissedToast'));
    setMode(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {deletablePostId && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setRemoveContent(true);
              setNote('');
              setMode('resolved');
            }}
          >
            <Trash2 aria-hidden /> {t('removeAndResolve')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            setRemoveContent(false);
            setNote('');
            setMode('resolved');
          }}
        >
          <Check aria-hidden /> {t('resolve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRemoveContent(false);
            setNote('');
            setMode('dismissed');
          }}
        >
          <X aria-hidden /> {t('dismiss')}
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        {mode && (
          <DialogContent
            size="sm"
            title={
              removeContent
                ? t('removeTitle')
                : mode === 'resolved'
                  ? t('resolveTitle')
                  : t('dismissTitle')
            }
            description={removeContent ? t('removeExplain') : undefined}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label={t('note')} description={t('noteHint')}>
                {(p) => (
                  <Textarea
                    {...p}
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  variant={removeContent ? 'danger' : 'primary'}
                  loading={pending}
                >
                  {removeContent
                    ? t('removeAndResolve')
                    : mode === 'resolved'
                      ? t('resolve')
                      : t('dismiss')}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
