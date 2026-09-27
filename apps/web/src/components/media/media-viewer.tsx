'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog as D } from 'radix-ui';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Pause,
  Play,
  X,
  ZoomIn,
  VideoOff,
  ZoomOut,
} from 'lucide-react';
import { isVideoKey } from '@magnox/shared';
import { usePrefs } from '@/components/shell/prefs-provider';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

export interface MediaItem {
  /** Upload key (an image or a video). */
  key: string;
  alt: string;
  width?: number;
  height?: number;
  animated?: boolean;
  /** Still frame of an animated image, so it can be paused. */
  posterKey?: string | null;
}

const ZOOMS = [1, 1.5, 2, 3] as const;

/** Shown in place of a video the browser can't load or decode, with a way to get the file. */
export function VideoUnavailable({ src, style }: { src: string; style?: React.CSSProperties }) {
  const t = useTranslations('media');
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-2 bg-black p-4 text-center text-sm text-white"
      style={style}
    >
      <VideoOff aria-hidden className="size-6" />
      <p>{t('cantPlay')}</p>
      <a
        href={`${src}?download=1`}
        download
        className="inline-flex items-center gap-1.5 rounded-ui px-2 py-1 font-semibold underline hover:bg-white/15"
      >
        <Download aria-hidden className="size-4" />
        {t('download')}
      </a>
    </div>
  );
}

const toolClass =
  'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-ui px-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-40 focus-visible:outline-white';

/**
 * Full-screen viewer for images and videos: zoom, play/pause, download, open the original,
 * previous/next, close (Esc). Focus stays inside while it's open and returns afterwards.
 */
export function MediaViewer({
  items,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('media');
  const { prefs } = usePrefs();
  const item = items[index];
  const video = item ? isVideoKey(item.key) : false;
  const pausable = Boolean(item && (video || (item.animated && item.posterKey)));
  const [zoom, setZoom] = React.useState(0);
  const [playing, setPlaying] = React.useState(prefs.animatedImages);
  const [failed, setFailed] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Radix only returns focus to a Dialog.Trigger; the viewer opens from anywhere, so remember.
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState({ index, open });
  // A new item (or reopening) starts unzoomed, playing only if the viewer allows animation.
  if (shown.index !== index || shown.open !== open) {
    setShown({ index, open });
    setZoom(0);
    setFailed(false);
    setPlaying(video ? false : prefs.animatedImages);
  }
  if (!item) return null;

  const url = mediaUrl(item.key)!;
  const still = !video && item.animated && item.posterKey && !playing;
  const src = still ? mediaUrl(item.posterKey)! : url;
  const many = items.length > 1;
  const go = (d: -1 | 1) => onIndexChange((index + d + items.length) % items.length);

  function togglePlay() {
    if (video) {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) void v.play();
      else v.pause();
    } else setPlaying((p) => !p);
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="mx-overlay fixed inset-0 z-50 bg-black/95" />
        <D.Content
          className="fixed inset-0 z-50 flex flex-col text-white outline-none"
          aria-describedby={item.alt ? 'mx-viewer-desc' : undefined}
          onOpenAutoFocus={() => {
            // Runs before focus moves into the viewer.
            returnFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(e) => {
            if (returnFocus.current?.isConnected) {
              e.preventDefault();
              returnFocus.current.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.target instanceof HTMLVideoElement) return; // the video uses arrows to seek
            if (many && e.key === 'ArrowLeft') go(-1);
            else if (many && e.key === 'ArrowRight') go(1);
            else if (!video && (e.key === '+' || e.key === '=')) setZoom((z) => Math.min(z + 1, 3));
            else if (!video && e.key === '-') setZoom((z) => Math.max(z - 1, 0));
            else if (pausable && e.key.toLowerCase() === 'k') togglePlay();
            else return;
            e.preventDefault();
          }}
        >
          <header className="flex flex-wrap items-center gap-1 bg-black/60 px-2 py-1.5 sm:px-3">
            <D.Title className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">
              {t(video ? 'videoTitle' : 'imageTitle', { n: index + 1, total: items.length })}
            </D.Title>
            {!video && (
              <>
                <button
                  type="button"
                  className={toolClass}
                  onClick={() => setZoom((z) => Math.max(z - 1, 0))}
                  disabled={zoom === 0}
                  aria-label={t('zoomOut')}
                  title={t('zoomOut')}
                >
                  <ZoomOut aria-hidden className="size-5" />
                </button>
                <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
                  {Math.round(ZOOMS[zoom]! * 100)}%
                </span>
                <button
                  type="button"
                  className={toolClass}
                  onClick={() => setZoom((z) => Math.min(z + 1, 3))}
                  disabled={zoom === 3}
                  aria-label={t('zoomIn')}
                  title={t('zoomIn')}
                >
                  <ZoomIn aria-hidden className="size-5" />
                </button>
              </>
            )}
            {pausable && !failed && (
              <button
                type="button"
                className={toolClass}
                onClick={togglePlay}
                aria-label={playing ? t('pause') : t('play')}
                title={`${playing ? t('pause') : t('play')} (K)`}
              >
                {playing ? (
                  <Pause aria-hidden className="size-5" />
                ) : (
                  <Play aria-hidden className="size-5" />
                )}
                <span className="hidden sm:inline">{playing ? t('pause') : t('play')}</span>
              </button>
            )}
            <a
              href={`${url}?download=1`}
              download
              className={toolClass}
              aria-label={t('download')}
              title={t('download')}
            >
              <Download aria-hidden className="size-5" />
              <span className="hidden sm:inline">{t('download')}</span>
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={toolClass}
              aria-label={t('openOriginal')}
              title={t('openOriginal')}
            >
              <ExternalLink aria-hidden className="size-5" />
            </a>
            <D.Close className={toolClass} aria-label={t('close')} title={`${t('close')} (Esc)`}>
              <X aria-hidden className="size-5" />
              <span className="hidden sm:inline">{t('close')}</span>
            </D.Close>
          </header>

          <div
            className={cn(
              'relative flex min-h-0 flex-1 p-3 sm:p-6',
              zoom > 0 ? 'overflow-auto' : 'items-center justify-center overflow-hidden',
            )}
            // Clicking the backdrop (not the media) closes, like most viewers.
            onClick={(e) => {
              if (e.target === e.currentTarget) onOpenChange(false);
            }}
          >
            {video && failed ? (
              <VideoUnavailable src={url} />
            ) : video ? (
              <video
                key={item.key}
                ref={videoRef}
                src={url}
                controls
                autoPlay={prefs.autoplayMedia}
                playsInline
                preload="metadata"
                aria-label={item.alt || t('video')}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setFailed(true)}
                // Videos scale up to fill the viewer (images keep their size until zoomed).
                className="h-full w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.key}
                src={src}
                alt={item.alt}
                className={cn(
                  'rounded-ui-sm object-contain select-none',
                  zoom === 0 ? 'max-h-full max-w-full' : 'm-auto max-w-none',
                )}
                style={
                  zoom > 0 && item.width
                    ? { width: `${item.width * ZOOMS[zoom]!}px` }
                    : zoom > 0
                      ? { transform: `scale(${ZOOMS[zoom]})`, transformOrigin: 'top left' }
                      : undefined
                }
                onDoubleClick={() => setZoom((z) => (z === 0 ? 2 : 0))}
              />
            )}
            {many && (
              <>
                <button
                  type="button"
                  className={cn(toolClass, 'absolute start-2 top-1/2 -translate-y-1/2 bg-black/50')}
                  onClick={() => go(-1)}
                  aria-label={t('previous')}
                >
                  <ChevronLeft aria-hidden className="size-6" />
                </button>
                <button
                  type="button"
                  className={cn(toolClass, 'absolute end-2 top-1/2 -translate-y-1/2 bg-black/50')}
                  onClick={() => go(1)}
                  aria-label={t('next')}
                >
                  <ChevronRight aria-hidden className="size-6" />
                </button>
              </>
            )}
          </div>

          {item.alt && (
            <D.Description
              id="mx-viewer-desc"
              className="bg-black/60 px-4 py-2 text-center text-sm text-white/90"
            >
              {item.alt}
            </D.Description>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** State for a viewer over a set of items: `show(i)` opens it at item i. */
export function useMediaViewer(items: MediaItem[]) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  return {
    show: (i: number) => {
      setIndex(i);
      setOpen(true);
    },
    viewer: (
      <MediaViewer
        items={items}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
      />
    ),
  };
}
