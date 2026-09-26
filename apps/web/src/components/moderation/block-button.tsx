'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { blockUserAction, unblockUserAction } from '@/app/actions/notifications';

/** Personal block: hides their posts behind a click and stops their notifications to you. */
export function BlockButton({
  userId,
  name,
  blocked,
}: {
  userId: string;
  name: string;
  blocked: boolean;
}) {
  const t = useTranslations('privacy');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function run(block: boolean) {
    setPending(true);
    const r = block ? await blockUserAction(userId) : await unblockUserAction(userId);
    setPending(false);
    setConfirm(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(block ? t('blocked', { name }) : t('unblocked', { name }));
    router.refresh();
  }

  if (blocked) {
    return (
      <Button size="sm" variant="outline" loading={pending} onClick={() => void run(false)}>
        {t('unblock')}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        <Ban aria-hidden /> {t('block')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm" title={t('blockTitle', { name })} description={t('blockExplain')}>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" loading={pending} onClick={() => void run(true)}>
              {t('block')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
