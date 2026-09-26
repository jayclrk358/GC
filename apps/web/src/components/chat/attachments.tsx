'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import type { MessageAttachment, MessageEmbed } from '@magnox/db';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

/** Image attachments. Animated images show a still frame until played when animation is off. */
export function Attachments({ items, animate }: { items: MessageAttachment[]; animate: boolean }) {
  const t = useTranslations('chat');
  if (!items.length) return null;
  return (
    <ul className={cn('mt-2 grid max-w-xl gap-2', items.length > 1 && 'grid-cols-2')}>
      {items.map((a) => (
        <li key={a.key}>
          <AttachmentImage a={a} animate={animate} label={t('playAnimation')} />
        </li>
      ))}
    </ul>
  );
}

function AttachmentImage({
  a,
  animate,
  label,
}: {
  a: MessageAttachment;
  animate: boolean;
  label: string;
}) {
  const [playing, setPlaying] = React.useState(false);
  const still = a.animated && !animate && !playing && a.posterKey;
  const src = mediaUrl(still ? a.posterKey : a.key);
  const full = mediaUrl(a.key);
  if (!src || !full) return null;
  const ratio = a.width && a.height ? `${a.width} / ${a.height}` : undefined;
  return (
    <div className="relative overflow-hidden rounded-ui border border-border bg-surface-2">
      <a href={full} target="_blank" rel="noopener">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={a.alt}
          loading="lazy"
          className="max-h-80 w-full object-contain"
          style={{ aspectRatio: ratio }}
        />
      </a>
      {still && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute start-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-xs font-bold text-white"
        >
          <Play className="size-3" aria-hidden /> GIF
          <span className="sr-only">: {label}</span>
        </button>
      )}
    </div>
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
