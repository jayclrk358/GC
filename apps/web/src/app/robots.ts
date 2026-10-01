import type { MetadataRoute } from 'next';
import { env } from '@magnox/core';

/** Let search engines in, except where only signed-in people go. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/settings',
        '/notifications',
        '/accept-terms',
        '/invite/',
        '/new',
        '/c/*/settings',
        '/c/*/apply',
        '/c/*/welcome',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
