import type { MetadataRoute } from 'next';
import { env, sitemapEntries } from '@magnox/core';

// Made on request, never at build time: Docker image builds have no database, and a prerendered
// copy would miss every community made since. The rows behind it are cached for an hour.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, '');
  const { communities, servers } = await sitemapEntries();
  const pages = [
    '',
    '/explore',
    '/servers',
    '/store',
    '/developers',
    '/legal/terms',
    '/legal/privacy',
  ];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'daily' as const })),
    ...communities.map((c) => ({
      url: `${base}/c/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: 'daily' as const,
    })),
    ...servers.map((s) => ({
      url: `${base}/servers/${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: 'daily' as const,
    })),
  ];
}
