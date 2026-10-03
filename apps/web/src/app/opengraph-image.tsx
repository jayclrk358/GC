import { OG_SIZE, shareImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Game Central: community hubs for games and game servers';

export default function Image() {
  return shareImage({
    title: 'Game Central',
    subtitle: 'Customisable, accessible community hubs for games and game servers.',
    facts: ['Forums', 'Chat & voice', 'Live server status'],
  });
}
