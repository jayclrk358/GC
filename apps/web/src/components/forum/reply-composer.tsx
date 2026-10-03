'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { docToText, emptyDoc, type RichNode } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/auth/form-error';
import { Alert } from '@/components/ui/misc';
import { RichTextEditor } from '@/components/rich-text/lazy-editor';
import { createReplyAction } from '@/app/actions/forum';
import { useThread } from './thread-context';

export function ReplyComposer({
  communityId,
  threadId,
  lastPage,
  slug,
  requireAlt,
}: {
  communityId: string;
  threadId: string;
  lastPage: number;
  slug: string;
  requireAlt: boolean;
}) {
  const t = useTranslations('forum');
  const router = useRouter();
  const { replyTo, setReplyTo, composerRef } = useThread();
  const [body, setBody] = React.useState<RichNode>(emptyDoc());
  const [key, setKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState('');
  /** Automod is holding the last reply for a moderator. */
  const [held, setHeld] = React.useState<string | null>(null);

  async function submit() {
    if (!docToText(body).trim() && !JSON.stringify(body).includes('"image"')) {
      setError(t('emptyReply'));
      return;
    }
    setPending(true);
    setError(null);
    setHeld(null);
    const r = await createReplyAction(communityId, threadId, {
      body,
      replyToId: replyTo?.postId ?? null,
    });
    setPending(false);
    if (!r.ok && r.code === 'held') {
      // Automod kept it back for a moderator to approve.
      setBody(emptyDoc());
      setKey((k) => k + 1);
      setReplyTo(null);
      setHeld(r.error);
      return;
    }
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setBody(emptyDoc());
    setKey((k) => k + 1);
    setReplyTo(null);
    setStatus(t('replyPosted'));
    // The action already sent back the updated thread; this only moves to the new reply.
    router.push(`/c/${slug}/t/${threadId}?page=${lastPage}#post-${r.data.id}`);
  }

  return (
    <section
      ref={composerRef}
      aria-labelledby="reply-h"
      className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
    >
      <h3 id="reply-h" className="font-bold">
        {t('writeReply')}
      </h3>
      <p role="status" className="sr-only">
        {status}
      </p>
      {replyTo && (
        <p className="flex items-center gap-2 text-sm">
          <span>{t('replyingTo', { name: replyTo.authorName })}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setReplyTo(null)}
            aria-label={t('cancelReplyTo')}
          >
            <X aria-hidden />
          </Button>
        </p>
      )}
      <FormError message={error} />
      {held && (
        <Alert tone="info" live>
          {held}
        </Alert>
      )}
      <RichTextEditor
        key={key}
        label={t('replyLabel')}
        value={body}
        onChange={setBody}
        communityId={communityId}
        mentions={communityId}
        requireAlt={requireAlt}
        minHeight="7rem"
        onSubmitShortcut={() => void submit()}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{t('composerHint')}</p>
        <Button onClick={() => void submit()} loading={pending}>
          {t('postReply')}
        </Button>
      </div>
    </section>
  );
}
