'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import type { CustomEmoji } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { uploadImage } from '@/components/upload/image-upload';
import { createEmojiAction, deleteEmojiAction, renameEmojiAction } from '@/app/actions/emoji';
import { mediaUrl } from '@/lib/media';

/** A name people can type after ":", made from a file name ("Party Parrot.png" → party_parrot). */
function nameFromFile(file: string): string {
  return file
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

/** Add, rename and remove the community's custom emoji. */
export function EmojiManager({
  communityId,
  emoji,
  limit,
}: {
  communityId: string;
  emoji: CustomEmoji[];
  limit: number;
}) {
  const t = useTranslations('emoji');
  const router = useRouter();
  const fileId = React.useId();
  const [key, setKey] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const full = emoji.length >= limit;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const r = await uploadImage(file, 'emoji', communityId);
      setKey(r.key);
      setName((n) => n || nameFromFile(file.name));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await createEmojiAction(communityId, { name, imageKey: key ?? '' });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    toast.success(t('added', { name: r.data.name }));
    setKey(null);
    setName('');
    setFields({});
    router.refresh();
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(editing.id);
    const r = await renameEmojiAction(communityId, editing.id, editing.name);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('renamed'));
    setEditing(null);
    router.refresh();
  }

  async function remove(item: CustomEmoji) {
    if (!window.confirm(t('confirmDelete', { name: item.name }))) return;
    setBusy(item.id);
    const r = await deleteEmojiAction(communityId, item.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('deleted', { name: item.name }));
    router.refresh();
  }

  const preview = mediaUrl(key);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection id="emoji-add" title={t('addTitle')} description={t('addHint')}>
        {full ? (
          <p className="text-sm text-muted">{t('full', { count: limit })}</p>
        ) : (
          <form onSubmit={add} className="flex flex-col gap-4" noValidate>
            <FormError message={error} />
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold" id={`${fileId}-label`}>
                  {t('image')}
                </span>
                <div className="flex items-center gap-3">
                  <span className="grid size-14 place-items-center overflow-hidden rounded-ui border border-border bg-surface-2 text-muted">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={t('preview')} className="size-10 object-contain" />
                    ) : (
                      <ImagePlus className="size-5" aria-hidden />
                    )}
                  </span>
                  <input
                    id={fileId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={onFile}
                    aria-labelledby={`${fileId}-label ${fileId}-btn`}
                  />
                  <Button asChild variant="secondary" size="sm" loading={uploading}>
                    <label htmlFor={fileId} id={`${fileId}-btn`} className="cursor-pointer">
                      {uploading ? t('uploading') : key ? t('replace') : t('choose')}
                    </label>
                  </Button>
                </div>
                {fields.imageKey && (
                  <p className="text-sm font-medium text-danger">{fields.imageKey}</p>
                )}
              </div>
              <Field
                label={t('name')}
                description={t('nameHint')}
                error={fields.name}
                className="min-w-48 flex-1"
              >
                {(p) => (
                  <Input
                    {...p}
                    value={name}
                    maxLength={32}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!key || uploading}>
                {t('add')}
              </Button>
            </div>
          </form>
        )}
      </SettingsSection>

      <SettingsSection id="emoji-list" title={t('listTitle', { count: emoji.length, limit })}>
        {emoji.length === 0 ? (
          <p className="text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {emoji.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="size-8 object-contain" />
                {editing?.id === item.id ? (
                  <form onSubmit={rename} className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      aria-label={t('renameLabel', { name: item.name })}
                      value={editing.name}
                      maxLength={32}
                      autoFocus
                      className="max-w-56"
                      onChange={(e) => setEditing({ id: item.id, name: e.target.value })}
                    />
                    <Button type="submit" size="sm" loading={busy === item.id}>
                      {t('save')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      {t('cancel')}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 font-mono text-sm">:{item.name}:</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('rename', { name: item.name })}
                      onClick={() => setEditing({ id: item.id, name: item.name })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-danger"
                      aria-label={t('delete', { name: item.name })}
                      loading={busy === item.id}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
