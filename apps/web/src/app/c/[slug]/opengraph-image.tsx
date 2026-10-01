import { communityShareCard } from '@magnox/core';
import { OG_SIZE, shareImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A community on Magnox';

/** A community's link preview, in its own colours (public communities only). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const card = await communityShareCard((await params).slug);
  if (!card) {
    return shareImage({ title: 'Magnox', subtitle: 'Community hubs for games and game servers.' });
  }
  return shareImage({
    title: card.name,
    subtitle: card.tagline,
    colors: card.colors,
    facts: [
      `${card.memberCount.toLocaleString('en')} ${card.memberCount === 1 ? 'member' : 'members'}`,
      ...(card.game ? [card.game] : []),
    ],
  });
}
