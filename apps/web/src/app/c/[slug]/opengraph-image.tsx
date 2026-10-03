import { communityShareCard } from '@gamecentral/core';
import { OG_SIZE, shareImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A community on Game Central';

/** A community's link preview, in its own colours (public communities only). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const card = await communityShareCard((await params).slug);
  if (!card) {
    // Private and unknown communities get the site's own picture, which is drawn once, instead
    // of a new one being drawn for every made-up address.
    return new Response(null, {
      status: 307,
      headers: { location: '/opengraph-image', 'cache-control': 'public, max-age=600' },
    });
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
