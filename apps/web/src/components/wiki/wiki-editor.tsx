'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { emptyDoc, type RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { RichTextEditor } from '@/components/rich-text/lazy-editor';
import { createWikiPageAction, updateWikiPageAction } from '@/app/actions/wiki';

export interface WikiEditorPage {
  id: string;
  title: string;
  body: RichNode;
  parentId: string | null;
  currentRevisionId: string | null;
}

/** Create or edit a wiki page. Every save is a revision; the summary explains the change. */
export function WikiEditor({
  communityId,
  slug,
  page,
  parents,
  defaultParentId,
  requireAlt,
}: {
  communityId: string;
  slug: string;
  page?: WikiEditorPage;
  /** Pages this one may sit under (already excludes the page and its descendants). */
  parents: { id: string; title: string; depth: number }[];
  defaultParentId?: string | null;
  requireAlt: boolean;
}) {
  const t = useTranslations('wiki');
  const router = useRouter();
  const [title, setTitle] = React.useState(page?.title ?? '');
  const [body, setBody] = React.useState<RichNode>(page?.body ?? emptyDoc());
  const [parentId, setParentId] = React.useState(page?.parentId ?? defaultParentId ?? '');
  const [summary, setSummary] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const touch =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDirty(true);
    };

  async function save() {
    setPending(true);
    setError(null);
    const input = {
      title,
      body,
      summary,
      parentId: parentId || null,
      baseRevisionId: page?.currentRevisionId ?? null,
    };
    const r = page
      ? await updateWikiPageAction(communityId, page.id, input)
      : await createWikiPageAction(communityId, input);
    if (!r.ok) {
      setPending(false);
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    setDirty(false);
    router.push(`/c/${slug}/wiki/${r.data.slug}`);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <FormError message={error} />
      <Field label={t('pageTitle')} error={fields.title} required>
        {(p) => (
          <Input
            {...p}
            value={title}
            maxLength={120}
            onChange={(e) => touch(setTitle)(e.target.value)}
            autoFocus={!page}
          />
        )}
      </Field>
      <Field label={t('parent')} error={fields.parentId} description={t('parentHint')}>
        {(p) => (
          <Select {...p} value={parentId} onValueChange={(v) => touch(setParentId)(v)}>
            <option value="">{t('noParent')}</option>
            {parents.map((o) => (
              <option key={o.id} value={o.id}>
                {'  '.repeat(o.depth)}
                {o.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t('content')}</span>
        <RichTextEditor
          label={t('content')}
          value={body}
          onChange={touch(setBody)}
          communityId={communityId}
          requireAlt={requireAlt}
          minHeight="24rem"
          onSubmitShortcut={() => void save()}
        />
        {fields.body && <p className="text-sm font-medium text-danger">{fields.body}</p>}
      </div>
      <Field label={t('summary')} description={t('summaryHint')} error={fields.summary}>
        {(p) => (
          <Input
            {...p}
            value={summary}
            maxLength={200}
            onChange={(e) => setSummary(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {page ? t('savePage') : t('createPage')}
        </Button>
      </div>
    </form>
  );
}
