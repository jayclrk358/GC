'use client';

import { useTranslations } from 'next-intl';
import { useMediaViewer, type MediaItem } from '@/components/media/media-viewer';
import { mediaUrl } from '@/lib/media';

export interface GalleryImage extends MediaItem {
  /** Shown in the grid: a still frame when the viewer turned animation off. */
  thumbKey: string;
  caption: string;
}

/** Gallery images; each opens the media viewer, which steps through the whole gallery. */
export function GalleryGrid({
  images,
  layout,
}: {
  images: GalleryImage[];
  layout: 'grid' | 'masonry';
}) {
  const t = useTranslations('media');
  const { show, viewer } = useMediaViewer(images);
  return (
    <>
      <ul
        className={
          layout === 'masonry'
            ? 'columns-1 gap-3 sm:columns-2 lg:columns-3'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {images.map((img, i) => {
          const src = mediaUrl(img.thumbKey);
          if (!src) return null;
          return (
            <li key={i} className="mb-3 break-inside-avoid">
              <figure className="overflow-hidden rounded-ui border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => show(i)}
                  className="block w-full cursor-zoom-in"
                  aria-label={img.alt ? undefined : t('viewNoAlt')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={img.alt}
                    loading="lazy"
                    className={layout === 'masonry' ? 'w-full' : 'aspect-video w-full object-cover'}
                  />
                </button>
                {img.caption && (
                  <figcaption className="p-2 text-sm text-muted">{img.caption}</figcaption>
                )}
              </figure>
            </li>
          );
        })}
      </ul>
      {viewer}
    </>
  );
}
