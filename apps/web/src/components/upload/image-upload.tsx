'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

export interface UploadedImage {
  key: string;
  url: string;
  width: number;
  height: number;
  animated: boolean;
  posterUrl: string | null;
}

export async function uploadImage(
  file: File,
  purpose: string,
  communityId?: string,
  alt?: string,
): Promise<UploadedImage> {
  const form = new FormData();
  form.set('file', file);
  form.set('purpose', purpose);
  if (communityId) form.set('communityId', communityId);
  if (alt) form.set('alt', alt);
  const res = await fetch('/api/uploads', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as UploadedImage & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data;
}

/** Single image picker with preview. Decorative images (banners, avatars) need no alt text. */
export function ImageUpload({
  label,
  description,
  purpose,
  communityId,
  value,
  onChange,
  shape = 'square',
}: {
  label: string;
  description?: string;
  purpose: string;
  communityId?: string;
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  shape?: 'square' | 'banner' | 'round';
}) {
  const t = useTranslations('upload');
  const inputId = React.useId();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const url = mediaUrl(value);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const r = await uploadImage(file, purpose, communityId);
      onChange(r.key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold" id={`${inputId}-label`}>
        {label}
      </span>
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            'grid shrink-0 place-items-center overflow-hidden border border-border bg-surface-2 text-muted',
            shape === 'banner' ? 'h-20 w-48 rounded-ui' : shape === 'round' ? 'size-20 rounded-full' : 'size-20 rounded-ui',
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={t('currentImage', { label })} className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            onChange={onFile}
            aria-labelledby={`${inputId}-label ${inputId}-btn`}
          />
          <Button asChild variant="secondary" size="sm" loading={pending}>
            <label htmlFor={inputId} id={`${inputId}-btn`} className="cursor-pointer">
              {pending ? t('uploading') : url ? t('replace') : t('upload')}
            </label>
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 aria-hidden /> {t('remove')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
