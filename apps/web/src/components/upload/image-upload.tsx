'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VARIANTS_BY_PURPOSE } from '@gamecentral/shared';
import { imgSources, mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

export interface UploadedImage {
  key: string;
  url: string;
  width: number;
  height: number;
  animated: boolean;
  posterUrl: string | null;
}

/**
 * Upload a file to /api/uploads. Uses XHR (not fetch) so `onProgress` can report how much has
 * been sent (0 to 1); at 1 the server is still processing. Abort with `signal`.
 */
export function uploadImage(
  file: File,
  purpose: string,
  communityId?: string,
  opts: {
    alt?: string;
    /** A still to show for a video until it's played. */
    poster?: Blob;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<UploadedImage> {
  const form = new FormData();
  form.set('file', file);
  form.set('purpose', purpose);
  if (communityId) form.set('communityId', communityId);
  if (opts.alt) form.set('alt', opts.alt);
  if (opts.poster) form.set('poster', opts.poster, 'poster.jpg');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as UploadedImage & { error?: string };
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else if (xhr.status === 413) reject(new Error('That file is too large.'));
      else reject(new Error(data.error ?? 'Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (opts.signal?.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Throw away an upload that won't be used after all (an attachment removed before sending).
 * The server only removes it if it's yours and not in anything you've posted.
 */
export function discardUpload(key: string): void {
  void fetch(`/api/uploads/${key}`, { method: 'DELETE', keepalive: true }).catch(() => {});
}

/** How far an upload has got: a bar, then "Processing…" once the file is sent. */
export function UploadProgress({
  value,
  label,
  className,
}: {
  /** 0 to 1. */
  value: number;
  /** What is uploading, e.g. "Uploading clip.mp4". */
  label: string;
  className?: string;
}) {
  const t = useTranslations('upload');
  const pct = Math.round(value * 100);
  const text = pct >= 100 ? t('processing') : `${pct}%`;
  return (
    <div className={cn('flex items-center gap-2 text-xs font-semibold tabular-nums', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={text}
        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-border"
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none',
            pct >= 100 && 'animate-pulse motion-reduce:animate-none',
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span aria-hidden>{text}</span>
    </div>
  );
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
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const variant = VARIANTS_BY_PURPOSE[purpose]?.[0];
  const full = mediaUrl(value);
  const preview = variant ? imgSources(value, variant) : full ? { src: full } : null;
  const url = preview?.src;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPending(true);
    setProgress(0);
    setError(null);
    try {
      const r = await uploadImage(file, purpose, communityId, { onProgress: setProgress });
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
            shape === 'banner'
              ? 'h-20 w-48 rounded-ui'
              : shape === 'round'
                ? 'size-20 rounded-full'
                : 'size-20 rounded-ui',
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...preview}
              alt={t('currentImage', { label })}
              decoding="async"
              className="size-full object-cover"
            />
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
      {pending && (
        <UploadProgress
          value={progress}
          label={t('progressLabel', { label })}
          className="max-w-64"
        />
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
