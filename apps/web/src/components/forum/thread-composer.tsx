'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { docToText, emptyDoc, type RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { RichTextEditor } from '@/components/rich-text/lazy-editor';
import { createThreadAction } from '@/app/actions/forum';

interface Draft {
  title: string;
  body: RichNode;
  flairId: string;
}

function draftKey(channelId: string) {
  return `mx:draft:thread:${channelId}`;
}

const noopSubscribe = () => () => {};

function readDraftRaw(channelId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(channelId));
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

export function ThreadComposer({
  communityId,
  channelId,
  flairs,
  requireFlair,
  canPoll,
  requireAlt,
}: {
  communityId: string;
  channelId: string;
  flairs: { id: string; name: string; color: string | null }[];
  requireFlair: boolean;
  canPoll: boolean;
  requireAlt: boolean;
}) {
  const t = useTranslations('forum');
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState<RichNode>(emptyDoc());
  const [flairId, setFlairId] = React.useState('');
  const [editorKey, setEditorKey] = React.useState(0);
  // A draft saved on an earlier visit. Offered, not silently applied: the writer decides.
  const savedRaw = React.useSyncExternalStore(
    noopSubscribe,
    () => readDraftRaw(channelId),
    () => null,
  );
  const [draftDecided, setDraftDecided] = React.useState(false);
  const savedDraft = React.useMemo(() => parseDraft(savedRaw), [savedRaw]);
  const offerDraft =
    !draftDecided && savedDraft !== null && Boolean(savedDraft.title || docToText(savedDraft.body));
  const [poll, setPoll] = React.useState<{
    question: string;
    options: string[];
    multiple: boolean;
    closesInHours: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  // Autosave drafts to this browser once the writer has started (or chosen about the old draft).
  React.useEffect(() => {
    if (!draftDecided) return;
    const id = setTimeout(() => {
      try {
        if (title || docToText(body))
          window.localStorage.setItem(
            draftKey(channelId),
            JSON.stringify({ title, body, flairId }),
          );
      } catch {
        /* storage unavailable */
      }
    }, 500);
    return () => clearTimeout(id);
  }, [title, body, flairId, channelId, draftDecided]);

  function restore() {
    if (!savedDraft) return;
    setTitle(savedDraft.title);
    setBody(savedDraft.body);
    setFlairId(savedDraft.flairId);
    setEditorKey((k) => k + 1);
    setDraftDecided(true);
  }

  function discard() {
    try {
      window.localStorage.removeItem(draftKey(channelId));
    } catch {
      /* ignore */
    }
    setDraftDecided(true);
  }

  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDraftDecided(true);
    };

  async function submit() {
    setPending(true);
    setError(null);
    const r = await createThreadAction(communityId, {
      channelId,
      title,
      body,
      flairId: flairId || null,
      poll: poll ? { ...poll, options: poll.options.map((o) => o.trim()).filter(Boolean) } : null,
    });
    if (!r.ok) {
      setPending(false);
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    try {
      window.localStorage.removeItem(draftKey(channelId));
    } catch {
      /* ignore */
    }
    router.push(`/c/${r.data.slug}/t/${r.data.id}`);
  }

  return (
    <form
      className="flex flex-col gap-5 rounded-ui-lg border border-border bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      {offerDraft && (
        <Alert tone="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t('draftFound')}
            <span className="flex gap-2">
              <Button type="button" size="sm" onClick={restore}>
                {t('restoreDraft')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={discard}>
                {t('discardDraft')}
              </Button>
            </span>
          </span>
        </Alert>
      )}
      <FormError message={error} />
      <Field label={t('threadTitle')} error={fields.title} required>
        {(p) => (
          <Input
            {...p}
            value={title}
            maxLength={200}
            onChange={(e) => edit(setTitle)(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      {flairs.length > 0 && (
        <Field label={t('flair')} error={fields.flairId} required={requireFlair}>
          {(p) => (
            <Select {...p} value={flairId} onChange={(e) => edit(setFlairId)(e.target.value)}>
              <option value="">{requireFlair ? t('chooseFlair') : t('noFlair')}</option>
              {flairs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          {t('body')}
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        </span>
        <RichTextEditor
          key={editorKey}
          label={t('body')}
          value={body}
          onChange={edit(setBody)}
          communityId={communityId}
          mentions={communityId}
          requireAlt={requireAlt}
          minHeight="12rem"
          onSubmitShortcut={() => void submit()}
        />
        {fields.body && <p className="text-sm font-medium text-danger">{fields.body}</p>}
        <p className="text-xs text-muted">{t('composerHint')}</p>
      </div>

      {canPoll &&
        (poll ? (
          <fieldset className="flex flex-col gap-3 rounded-ui border border-border p-4">
            <legend className="px-1 font-semibold">{t('pollLegend')}</legend>
            <Field label={t('pollQuestion')} error={fields['poll.question']} required>
              {(p) => (
                <Input
                  {...p}
                  value={poll.question}
                  maxLength={200}
                  onChange={(e) => setPoll({ ...poll, question: e.target.value })}
                />
              )}
            </Field>
            <ol className="flex flex-col gap-2">
              {poll.options.map((o, i) => (
                <li key={i} className="flex items-end gap-2">
                  <Field label={t('pollOption', { n: i + 1 })} className="flex-1">
                    {(p) => (
                      <Input
                        {...p}
                        value={o}
                        maxLength={100}
                        onChange={(e) =>
                          setPoll({
                            ...poll,
                            options: poll.options.map((x, j) => (j === i ? e.target.value : x)),
                          })
                        }
                      />
                    )}
                  </Field>
                  {poll.options.length > 2 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('removeOption', { n: i + 1 })}
                      onClick={() =>
                        setPoll({ ...poll, options: poll.options.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ol>
            {poll.options.length < 10 && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}
                >
                  <Plus aria-hidden /> {t('addOption')}
                </Button>
              </div>
            )}
            {fields['poll.options'] && (
              <p className="text-sm text-danger">{fields['poll.options']}</p>
            )}
            <SwitchField
              label={t('pollMultiple')}
              checked={poll.multiple}
              onCheckedChange={(v) => setPoll({ ...poll, multiple: v })}
            />
            <Field label={t('pollCloses')}>
              {(p) => (
                <Select
                  {...p}
                  value={poll.closesInHours}
                  onChange={(e) => setPoll({ ...poll, closesInHours: Number(e.target.value) })}
                >
                  <option value={0}>{t('pollNever')}</option>
                  <option value={24}>{t('pollDays', { count: 1 })}</option>
                  <option value={72}>{t('pollDays', { count: 3 })}</option>
                  <option value={168}>{t('pollDays', { count: 7 })}</option>
                </Select>
              )}
            </Field>
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPoll(null)}>
                {t('removePoll')}
              </Button>
            </div>
          </fieldset>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPoll({ question: '', options: ['', ''], multiple: false, closesInHours: 0 })
              }
            >
              <BarChart3 aria-hidden /> {t('addPoll')}
            </Button>
          </div>
        ))}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {t('postThread')}
        </Button>
      </div>
    </form>
  );
}
