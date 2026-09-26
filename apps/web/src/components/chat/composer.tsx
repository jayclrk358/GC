'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AtSign, ImagePlus, Loader2, SendHorizontal, Type, X } from 'lucide-react';
import { docToText, MAX_ATTACHMENTS, MAX_MESSAGE_CHARS, type RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { uploadImage } from '@/components/upload/image-upload';
import { emitSocket } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { ChatEditor, type ChatEditorHandle } from './chat-editor';
import { authorName } from './message-item';
import type { ChatMessage } from './types';

interface PendingAttachment {
  id: string;
  previewUrl: string;
  key: string | null;
  alt: string;
  error: string | null;
}

export interface SendInput {
  body: RichNode;
  attachments: { key: string; alt: string }[];
  replyToId: string | null;
  mentionReplied: boolean;
}

export interface ComposerHandle {
  focus: () => void;
}

export const Composer = React.forwardRef<
  ComposerHandle,
  {
    replyTo: ChatMessage | null;
    requireAlt: boolean;
    onCancelReply: () => void;
    onEditLast: () => void;
    onSend: (input: SendInput) => Promise<{ ok: boolean; retryAfter?: number }>;
  }
>(function Composer({ replyTo, requireAlt, onCancelReply, onEditLast, onSend }, ref) {
  const t = useTranslations('chat');
  const { channel, perms, prefs, communityId } = useChat();
  const editorRef = React.useRef<ChatEditorHandle>(null);
  const fileInputId = React.useId();
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [length, setLength] = React.useState(0);
  const [toolbar, setToolbar] = React.useState(false);
  const [mentionReplied, setMentionReplied] = React.useState(true);
  const [cooldownUntil, setCooldownUntil] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const lastTyping = React.useRef(0);
  const hintId = `composer-hint-${channel.id}`;

  React.useImperativeHandle(ref, () => ({ focus: () => editorRef.current?.focus() }), []);

  React.useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  // Free preview URLs when attachments go away.
  const previews = React.useRef<string[]>([]);
  React.useEffect(() => {
    previews.current = attachments.map((a) => a.previewUrl);
  });
  React.useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function addFiles(files: File[]) {
    if (!perms.attach) {
      setError(t('noAttach'));
      return;
    }
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(t('tooManyAttachments', { max: MAX_ATTACHMENTS }));
      return;
    }
    setError(null);
    for (const file of files.slice(0, room)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setAttachments((list) => [
        ...list,
        { id, previewUrl: URL.createObjectURL(file), key: null, alt: '', error: null },
      ]);
      try {
        const up = await uploadImage(file, 'content', communityId);
        setAttachments((list) => list.map((a) => (a.id === id ? { ...a, key: up.key } : a)));
      } catch (e) {
        setAttachments((list) =>
          list.map((a) => (a.id === id ? { ...a, error: (e as Error).message } : a)),
        );
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((list) => {
      const gone = list.find((a) => a.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return list.filter((a) => a.id !== id);
    });
  }

  async function submit(doc: RichNode) {
    const text = docToText(doc).trim();
    const ready = attachments.filter((a) => a.key && !a.error);
    if (!text && !ready.length) return;
    if (cooldown > 0) {
      setError(t('slowmodeWait', { seconds: cooldown }));
      return;
    }
    if (attachments.some((a) => !a.key && !a.error)) {
      setError(t('stillUploading'));
      return;
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      setError(t('tooLong', { max: MAX_MESSAGE_CHARS }));
      return;
    }
    if ((requireAlt || prefs.requireAltTextReminder) && ready.some((a) => !a.alt.trim())) {
      setError(t('altRequired'));
      document.getElementById(`alt-${ready.find((a) => !a.alt.trim())!.id}`)?.focus();
      return;
    }
    setError(null);
    editorRef.current?.clear();
    setLength(0);
    const sent = attachments;
    setAttachments([]);
    const r = await onSend({
      body: doc,
      attachments: ready.map((a) => ({ key: a.key!, alt: a.alt.trim() })),
      replyToId: replyTo?.id ?? null,
      mentionReplied,
    });
    sent.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    if (r.ok && channel.slowmodeSeconds && !perms.manage)
      setCooldownUntil(Date.now() + channel.slowmodeSeconds * 1000);
    if (!r.ok && r.retryAfter) setCooldownUntil(Date.now() + r.retryAfter * 1000);
    setNow(Date.now());
  }

  function onChange(_doc: RichNode, text: string) {
    setLength(text.length);
    if (text.trim() && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      emitSocket('typing', channel.id);
    }
  }

  return (
    <div className="px-4 pt-1 pb-3">
      {replyTo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-ui border border-b-0 border-border bg-surface-2 px-3 py-1.5 text-sm">
          <span className="min-w-0 truncate">{t('replyingTo', { name: authorName(replyTo) })}</span>
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={mentionReplied}
              onClick={() => setMentionReplied((v) => !v)}
              className={cn(!mentionReplied && 'text-muted')}
            >
              <AtSign aria-hidden /> {t('pingReplied')}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('cancelReply')}
              onClick={onCancelReply}
            >
              <X aria-hidden />
            </Button>
          </span>
        </div>
      )}
      <div
        className={cn(
          'rounded-ui border border-muted/70 bg-surface focus-within:border-primary',
          replyTo && 'rounded-t-none',
        )}
      >
        {attachments.length > 0 && (
          <ul
            className="flex flex-wrap gap-3 border-b border-border p-2"
            aria-label={t('attachmentsLabel')}
          >
            {attachments.map((a, i) => (
              <li key={a.id} className="flex w-44 flex-col gap-1">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.previewUrl}
                    alt=""
                    className={cn('h-24 w-full rounded-ui-sm object-cover', !a.key && 'opacity-50')}
                  />
                  {!a.key && !a.error && (
                    <Loader2
                      className="absolute inset-0 m-auto size-6 animate-spin text-fg motion-reduce:animate-none"
                      aria-label={t('uploading')}
                      role="img"
                    />
                  )}
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    className="absolute end-1 top-1"
                    aria-label={t('removeAttachment', { n: i + 1 })}
                    onClick={() => removeAttachment(a.id)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {a.error ? (
                  <p className="text-xs text-danger">{a.error}</p>
                ) : (
                  <>
                    <label htmlFor={`alt-${a.id}`} className="text-xs font-semibold">
                      {t('altLabel', { n: i + 1 })}
                    </label>
                    <input
                      id={`alt-${a.id}`}
                      value={a.alt}
                      maxLength={1000}
                      placeholder={t('altPlaceholder')}
                      onChange={(e) =>
                        setAttachments((list) =>
                          list.map((x) => (x.id === a.id ? { ...x, alt: e.target.value } : x)),
                        )
                      }
                      className="rounded-ui-sm border border-muted/70 bg-surface px-2 py-1 text-sm"
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1 p-1">
          {perms.attach && (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('attach')}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                onClick={() => document.getElementById(fileInputId)?.click()}
              >
                <ImagePlus aria-hidden />
              </Button>
              <input
                id={fileInputId}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void addFiles(files);
                }}
              />
            </>
          )}
          <ChatEditor
            ref={editorRef}
            label={t('messageLabel', { channel: channel.name })}
            placeholder={t('placeholder', { channel: channel.name })}
            communityId={communityId}
            showToolbar={toolbar}
            describedBy={hintId}
            onSubmit={(doc) => void submit(doc)}
            onChange={onChange}
            onPasteFiles={(files) => void addFiles(files)}
            onArrowUpEmpty={onEditLast}
            onEscape={() => {
              if (replyTo) {
                onCancelReply();
                return true;
              }
              return false;
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('formatting')}
            aria-expanded={toolbar}
            onClick={() => setToolbar((v) => !v)}
          >
            <Type aria-hidden />
          </Button>
          <Button
            size="icon"
            aria-label={cooldown ? t('sendIn', { seconds: cooldown }) : t('send')}
            disabled={cooldown > 0}
            onClick={() => {
              const doc = editorRef.current?.getDoc();
              if (doc) void submit(doc);
            }}
          >
            {cooldown > 0 ? (
              <span className="text-xs tabular-nums">{cooldown}</span>
            ) : (
              <SendHorizontal aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p id={hintId}>
          {t('composerHint')}
          {channel.slowmodeSeconds > 0 && !perms.manage && (
            <> · {t('slowmodeOn', { seconds: channel.slowmodeSeconds })}</>
          )}
        </p>
        {length > MAX_MESSAGE_CHARS - 500 && (
          <p
            className={cn(
              'tabular-nums',
              length > MAX_MESSAGE_CHARS && 'font-semibold text-danger',
            )}
          >
            {t('charsLeft', { count: MAX_MESSAGE_CHARS - length })}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
