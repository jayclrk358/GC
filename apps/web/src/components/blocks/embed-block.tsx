import { headers } from 'next/headers';
import type { BlockConfig } from '@magnox/shared';
import { ClickToLoad } from './click-to-load';
import { BlockSection } from './section';

export async function EmbedBlock({ id, config }: { id: string; config: BlockConfig<'embed'> }) {
  const host = (await headers()).get('host')?.split(':')[0] ?? 'localhost';
  const src =
    config.provider === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${config.ref}?autoplay=1&rel=0`
      : `https://player.twitch.tv/?channel=${config.ref}&parent=${host}&autoplay=true`;
  return (
    <BlockSection id={id} heading={config.heading || undefined}>
      <ClickToLoad src={src} title={config.title} provider={config.provider === 'youtube' ? 'YouTube' : 'Twitch'} />
    </BlockSection>
  );
}
