'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Maximize2, Play } from 'lucide-react';
import type { MessageAttachment, MessageEmbed } from '@gamecentral/db';
import { isVideoKey } from '@gamecentral/shared';
import { useMediaViewer, VideoUnavailable } from '@/components/media/media-viewer';
import { imgSources, mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

/**
 * Image and video attachments. Images open in the media viewer; videos play inline and can be
 * expanded. Animated images show a still frame until played when animation is off.
 */
export function Attachments({ items, animate }: { items: MessageAttachment[]; animate: boolean }) {
  const { show, viewer } = useMediaViewer(items);
  if (!items.length) return null;
  return (
    <>
      <ul className={cn('mt-2 grid max-w-xl gap-2', items.length > 1 && 'grid-cols-2')}>
        {items.map((a, i) => (
          <li key={a.key}>
            {isVideoKey(a.key) ? (
              <AttachmentVideo a={a} onExpand={() => show(i)} />
            ) : (
              <AttachmentImage a={a} animate={animate} onOpen={() => show(i)} />
            )}
          </li>
        ))}
      </ul>
      {viewer}
    </>
  );
}

function AttachmentImage({
  a,
  animate,
  onOpen,
}: {
  a: MessageAttachment;
  animate: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('chat');
  const tm = useTranslations('media');
  const [playing, setPlaying] = React.useState(false);
  const still = a.animated && !animate && !playing && a.posterKey;
  // Inline, the smaller copy is plenty; the viewer shows the full image.
  const src = still ? { src: mediaUrl(a.posterKey) ?? '' } : imgSources(a.key, 'md');
  if (!src?.src) return null;
  const ratio = a.width && a.height ? `${a.width} / ${a.height}` : undefined;
  return (
    <div className="relative overflow-hidden rounded-ui border border-border bg-surface-2">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-zoom-in"
        aria-label={a.alt ? undefined : tm('viewNoAlt')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...src}
          alt={a.alt}
          loading="lazy"
          decoding="async"
          className="max-h-80 w-full object-contain"
          style={{ aspectRatio: ratio }}
        />
      </button>
      {still && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute start-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-xs font-bold text-white"
        >
          <Play className="size-3" aria-hidden /> GIF
          <span className="sr-only">: {t('playAnimation')}</span>
        </button>
      )}
    </div>
  );
}

function AttachmentVideo({ a, onExpand }: { a: MessageAttachment; onExpand: () => void }) {
  const t = useTranslations('chat');
  const tm = useTranslations('media');
  const [failed, setFailed] = React.useState(false);
  // Server-rendered videos can fail before React listens for `error`, so check on mount too.
  const ref = React.useCallback((v: HTMLVideoElement | null) => {
    if (v?.error) setFailed(true);
  }, []);
  const src = mediaUrl(a.key);
  // A still of the opening frame (made when it was uploaded), so nothing loads until it's played.
  const poster = mediaUrl(a.posterKey);
  if (!src) return null;
  const ratio = a.width && a.height ? `${a.width} / ${a.height}` : '16 / 9';
  return (
    <figure className="relative overflow-hidden rounded-ui border border-border bg-black">
      {failed ? (
        <VideoUnavailable mediaKey={a.key} style={{ aspectRatio: ratio }} />
      ) : (
        <>
          {/* Chat videos have no caption tracks; the description below stands in. */}
          <video
            ref={ref}
            // Without a still, #t= makes browsers that load only metadata (Safari) show the
            // first frame.
            src={poster ? src : `${src}#t=0.1`}
            poster={poster ?? undefined}
            controls
            playsInline
            preload={poster ? 'none' : 'metadata'}
            aria-label={a.alt || tm('video')}
            onError={() => setFailed(true)}
            className="max-h-80 w-full bg-black"
            style={{ aspectRatio: ratio }}
          />
          <button
            type="button"
            onClick={onExpand}
            className="absolute end-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-black/75 text-white hover:bg-black"
            aria-label={t('expandVideo')}
            title={t('expandVideo')}
          >
            <Maximize2 className="size-4" aria-hidden />
          </button>
        </>
      )}
      {a.alt && (
        <figcaption className="bg-surface-2 px-2 py-1 text-xs text-muted">{a.alt}</figcaption>
      )}
    </figure>
  );
}

/** Link previews. Images were fetched and re-hosted by the server, never hot-linked. */
export function Embeds({ items }: { items: MessageEmbed[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 flex max-w-xl flex-col gap-2">
      {items.map((e) => {
        const img = mediaUrl(e.imageKey);
        return (
          <li
            key={e.url}
            className="flex gap-3 rounded-ui border border-s-4 border-border border-s-primary bg-surface-2 p-3"
          >
            <div className="min-w-0 flex-1">
              {e.siteName && <p className="text-xs font-semibold text-muted">{e.siteName}</p>}
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="font-semibold text-primary underline"
              >
                {e.title || e.url}
              </a>
              {e.description && <p className="mt-1 line-clamp-3 text-sm">{e.description}</p>}
            </div>
            {img && (
              // Decorative: the title and description carry the meaning.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt=""
                loading="lazy"
                className="size-20 shrink-0 rounded-ui-sm object-cover"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
