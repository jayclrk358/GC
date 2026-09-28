'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AtSign, Film, ImagePlus, SendHorizontal, Type, X } from 'lucide-react';
import { docToText, MAX_MESSAGE_CHARS, VIDEO_TYPES, type RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { uploadImage, UploadProgress } from '@/components/upload/image-upload';
import { emitSocket } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { ChatEditor, type ChatEditorHandle } from './chat-editor';
import { authorName } from './message-item';
import type { ChatMessage } from './types';

interface PendingAttachment {
  id: string;
  name: string;
  previewUrl: string;
  video: boolean;
  key: string | null;
  alt: string;
  error: string | null;
  /** How much has been sent, 0 to 1. */
  progress: number;
}

/**
 * Whether this browser can show the video's picture. Browsers skip streams they can't decode
 * (e.g. HEVC in Chrome/Firefox), so check before uploading something nobody can watch.
 */
function probeVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    // A slow or huge file shouldn't block the upload; the server still checks the format.
    const timer = setTimeout(() => done(true), 8000);
    v.muted = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(v.videoWidth > 0);
    v.onerror = () => done(false);
    v.src = url;
  });
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
  // Uploads still in flight, so removing an attachment (or leaving) cancels its upload.
  const uploads = React.useRef(new Map<string, AbortController>());
  React.useEffect(() => {
    const inFlight = uploads.current;
    return () => inFlight.forEach((c) => c.abort());
  }, []);

  async function addFiles(files: File[]) {
    if (!perms.attach) {
      setError(t('noAttach'));
      return;
    }
    const room = perms.maxAttachments - attachments.length;
    if (room <= 0) {
      setError(t('tooManyAttachments', { max: perms.maxAttachments }));
      return;
    }
    setError(null);
    // Files upload side by side, each with its own progress bar.
    for (const file of files.slice(0, room)) void addFile(file);
  }

  async function addFile(file: File) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const video = (VIDEO_TYPES as readonly string[]).includes(file.type);
    const update = (patch: Partial<PendingAttachment>) =>
      setAttachments((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setAttachments((list) => [
      ...list,
      {
        id,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        video,
        key: null,
        alt: '',
        error: null,
        progress: 0,
      },
    ]);
    // Checked here too so an oversized or unplayable video fails before it uploads.
    if (video && file.size > perms.maxVideoMb * 1_000_000) {
      return update({ error: t('videoTooLarge', { max: perms.maxVideoMb }) });
    }
    if (video && !(await probeVideo(file))) return update({ error: t('videoUnplayable') });
    const abort = new AbortController();
    uploads.current.set(id, abort);
    try {
      const up = await uploadImage(file, video ? 'video' : 'content', communityId, {
        signal: abort.signal,
        onProgress: (progress) => update({ progress }),
      });
      update({ key: up.key, progress: 1 });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') update({ error: (e as Error).message });
    } finally {
      uploads.current.delete(id);
    }
  }

  function removeAttachment(id: string) {
    uploads.current.get(id)?.abort();
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
                  {a.video ? (
                    <video
                      src={a.previewUrl}
                      muted
                      playsInline
                      preload="metadata"
                      aria-hidden
                      tabIndex={-1}
                      className={cn(
                        'h-24 w-full rounded-ui-sm bg-black object-cover',
                        !a.key && 'opacity-50',
                      )}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.previewUrl}
                      alt=""
                      className={cn(
                        'h-24 w-full rounded-ui-sm object-cover',
                        !a.key && 'opacity-50',
                      )}
                    />
                  )}
                  {a.video && (
                    <span className="absolute start-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <Film className="size-3" aria-hidden />
                      {t('videoBadge')}
                    </span>
                  )}
                  {!a.key && !a.error && (
                    <UploadProgress
                      value={a.progress}
                      label={t('uploadingFile', { name: a.name })}
                      className="absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 px-2 py-1 text-fg"
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
                      {t(a.video ? 'altLabelVideo' : 'altLabel', { n: i + 1 })}
                    </label>
                    <input
                      id={`alt-${a.id}`}
                      value={a.alt}
                      maxLength={1000}
                      placeholder={t(a.video ? 'altPlaceholderVideo' : 'altPlaceholder')}
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
                disabled={attachments.length >= perms.maxAttachments}
                onClick={() => document.getElementById(fileInputId)?.click()}
              >
                <ImagePlus aria-hidden />
              </Button>
              <input
                id={fileInputId}
                type="file"
                accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif', ...VIDEO_TYPES].join(
                  ',',
                )}
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
