'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Flag, History, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import type { RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { RichText } from '@/components/rich-text/rich-text';
import { RichTextEditor } from '@/components/rich-text/lazy-editor';
import { ReportDialog } from '@/components/moderation/report-dialog';
import {
  deletePostAction,
  editPostAction,
  markSolutionAction,
  postHistoryAction,
} from '@/app/actions/forum';
import { formatDateTime } from '@/lib/format';
import { useThread } from './thread-context';

export function PostActions({
  communityId,
  slug,
  channelName,
  threadId,
  threadTitle,
  post,
  can,
}: {
  communityId: string;
  slug: string;
  channelName: string;
  threadId: string;
  threadTitle: string;
  post: {
    id: string;
    isOp: boolean;
    body: RichNode | null;
    authorName: string;
    edited: boolean;
    isSolution: boolean;
  };
  can: { reply: boolean; edit: boolean; delete: boolean; report: boolean; solve: boolean };
}) {
  const t = useTranslations('forum');
  const router = useRouter();
  const { setReplyTo, composerRef } = useThread();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<RichNode | null>(post.body);
  const [title, setTitle] = React.useState(threadTitle);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [history, setHistory] = React.useState<
    { id: string; body: RichNode; createdAt: Date }[] | null
  >(null);

  async function saveEdit() {
    if (!draft) return;
    setPending(true);
    const r = await editPostAction(
      communityId,
      post.id,
      { body: draft },
      post.isOp ? title : undefined,
    );
    setPending(false);
    if (r.ok) {
      setEditing(false);
      router.refresh();
    } else setError(r.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {can.reply && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setReplyTo({ postId: post.id, authorName: post.authorName });
            composerRef.current?.scrollIntoView({ block: 'center' });
            composerRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
          }}
        >
          <Reply aria-hidden /> {t('reply')}
          <span className="sr-only"> {t('toAuthor', { name: post.authorName })}</span>
        </Button>
      )}
      {can.solve && (
        <Button
          size="sm"
          variant={post.isSolution ? 'secondary' : 'ghost'}
          onClick={async () => {
            const r = await markSolutionAction(
              communityId,
              threadId,
              post.isSolution ? null : post.id,
            );
            if (r.ok) router.refresh();
            else toast.error(r.error);
          }}
        >
          <CheckCircle2 aria-hidden /> {post.isSolution ? t('unmarkAnswer') : t('markAnswer')}
        </Button>
      )}
      {(can.edit || can.delete || can.report || post.edited) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('moreActions', { name: post.authorName })}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {can.edit && (
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden /> {t('edit')}
              </DropdownMenuItem>
            )}
            {post.edited && (
              <DropdownMenuItem
                onSelect={async () => {
                  const r = await postHistoryAction(communityId, post.id);
                  if (r.ok) setHistory(r.data);
                  else toast.error(r.error);
                }}
              >
                <History aria-hidden /> {t('history')}
              </DropdownMenuItem>
            )}
            {can.report && (
              <DropdownMenuItem onSelect={() => setReporting(true)}>
                <Flag aria-hidden /> {t('report')}
              </DropdownMenuItem>
            )}
            {can.delete && (
              <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden /> {post.isOp ? t('deleteThread') : t('delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={post.isOp ? t('editThread') : t('editPost')} size="lg">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <FormError message={error} />
            {post.isOp && (
              <Field label={t('threadTitle')}>
                {(p) => (
                  <Input
                    {...p}
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                )}
              </Field>
            )}
            <RichTextEditor
              label={t('body')}
              value={draft}
              onChange={setDraft}
              communityId={communityId}
              mentions={communityId}
              onSubmitShortcut={() => void saveEdit()}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={pending}>
                {t('saveEdit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          size="sm"
          title={post.isOp ? t('deleteThreadTitle') : t('deletePostTitle')}
          description={post.isOp ? t('deleteThreadConfirm') : t('deletePostConfirm')}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const r = await deletePostAction(communityId, post.id);
                setConfirmDelete(false);
                if (!r.ok) toast.error(r.error);
                else if (r.data.threadDeleted) router.push(`/c/${slug}/forum/${channelName}`);
                else router.refresh();
              }}
            >
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent title={t('historyTitle')} size="lg">
          {history?.length ? (
            <ol className="flex flex-col gap-4">
              {history.map((h) => (
                <li key={h.id} className="rounded-ui border border-border p-3">
                  <p className="mb-2 text-sm text-muted">
                    {t('versionFrom', { date: formatDateTime(h.createdAt) })}
                  </p>
                  <RichText doc={h.body} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">{t('noHistory')}</p>
          )}
        </DialogContent>
      </Dialog>

      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        communityId={communityId}
        targetType={post.isOp ? 'thread' : 'post'}
        targetId={post.isOp ? threadId : post.id}
        what={post.isOp ? t('thisThread') : t('thisPost')}
      />
    </div>
  );
}
