'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Lock, MoreHorizontal, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deleteWikiPageAction,
  restoreRevisionAction,
  setWikiProtectedAction,
} from '@/app/actions/wiki';

/** Moderator tools for a wiki page: protect and delete. */
export function WikiPageTools({
  communityId,
  pageId,
  protectedPage,
  title,
}: {
  communityId: string;
  pageId: string;
  protectedPage: boolean;
  title: string;
}) {
  const t = useTranslations('wiki');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label={t('moreActions')}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              const r = await setWikiProtectedAction(communityId, pageId, !protectedPage);
              if (r.ok) {
                toast.success(protectedPage ? t('unprotectedToast') : t('protectedToast'));
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            {protectedPage ? <Unlock aria-hidden /> : <Lock aria-hidden />}
            {protectedPage ? t('unprotect') : t('protect')}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirm(true)}>
            <Trash2 aria-hidden /> {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          size="sm"
          title={t('deleteTitle', { title })}
          description={t('deleteConfirm')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const r = await deleteWikiPageAction(communityId, pageId);
                setPending(false);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                setConfirm(false);
                toast.success(t('deletedToast'));
                router.push(window.location.pathname.replace(/\/wiki\/.*$/, '/wiki'));
              }}
            >
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Restore an old revision (creates a new revision with its content). */
export function RestoreRevisionButton({
  communityId,
  pageId,
  revisionId,
  pageHref,
  label,
}: {
  communityId: string;
  pageId: string;
  revisionId: string;
  pageHref: string;
  label: string;
}) {
  const t = useTranslations('wiki');
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setConfirm(true)} aria-label={label}>
        <RotateCcw aria-hidden /> {t('restore')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm" title={t('restoreTitle')} description={t('restoreConfirm')}>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                setPending(true);
                const r = await restoreRevisionAction(communityId, pageId, revisionId);
                setPending(false);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                setConfirm(false);
                toast.success(t('restoredToast'));
                router.push(pageHref);
              }}
            >
              {t('restore')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
