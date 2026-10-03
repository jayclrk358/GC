import type { BlockConfig } from '@gamecentral/shared';
import { posterKeysFor } from '@gamecentral/core';
import { getPrefs } from '@/lib/prefs';
import { BlockSection } from './section';
import { GalleryGrid } from './gallery-grid';

export async function GalleryBlock({ id, config }: { id: string; config: BlockConfig<'gallery'> }) {
  if (!config.images.length) return null;
  const [prefs, posters] = await Promise.all([
    getPrefs(),
    posterKeysFor(config.images.map((i) => i.key)),
  ]);
  return (
    <BlockSection id={id} heading={config.heading}>
      <GalleryGrid
        layout={config.layout}
        images={config.images.map((img) => {
          const posterKey = posters.get(img.key) ?? null;
          return {
            key: img.key,
            alt: img.alt,
            caption: img.caption,
            animated: Boolean(posterKey),
            posterKey,
            thumbKey: (!prefs.animatedImages && posterKey) || img.key,
          };
        })}
      />
    </BlockSection>
  );
}
