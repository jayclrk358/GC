import type { BlockConfig } from '@magnox/shared';
import { posterKeysFor } from '@magnox/core';
import { getPrefs } from '@/lib/prefs';
import { mediaUrl } from '@/lib/media';
import { BlockSection } from './section';

export async function GalleryBlock({ id, config }: { id: string; config: BlockConfig<'gallery'> }) {
  if (!config.images.length) return null;
  const prefs = await getPrefs();
  const posters = prefs.animatedImages ? new Map<string, string>() : await posterKeysFor(config.images.map((i) => i.key));
  return (
    <BlockSection id={id} heading={config.heading}>
      <ul className={config.layout === 'masonry' ? 'columns-1 gap-3 sm:columns-2 lg:columns-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
        {config.images.map((img, i) => {
          const src = mediaUrl(posters.get(img.key) ?? img.key);
          const full = mediaUrl(img.key);
          if (!src || !full) return null;
          return (
            <li key={i} className="mb-3 break-inside-avoid">
              <figure className="overflow-hidden rounded-ui border border-border bg-surface">
                <a href={full}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={img.alt}
                    loading="lazy"
                    className={config.layout === 'masonry' ? 'w-full' : 'aspect-video w-full object-cover'}
                  />
                </a>
                {img.caption && <figcaption className="p-2 text-sm text-muted">{img.caption}</figcaption>}
              </figure>
            </li>
          );
        })}
      </ul>
    </BlockSection>
  );
}
