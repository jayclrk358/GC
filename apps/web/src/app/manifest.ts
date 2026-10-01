import type { MetadataRoute } from 'next';

/** Lets people install Magnox as an app (from the browser menu, or "Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Magnox',
    short_name: 'Magnox',
    description: 'Customisable, accessible community hubs for games and game servers.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#07080f',
    theme_color: '#07080f',
    categories: ['games', 'social'],
    icons: [
      { src: '/icons/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icons/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icons/maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
    ],
  };
}
