import type { MetadataRoute } from 'next';
import { env, sitemapEntries } from '@magnox/core';

// Rebuilt at most hourly: it lists every public community and listed server.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, '');
  const { communities, servers } = await sitemapEntries();
  const pages = ['', '/explore', '/servers', '/store', '/legal/terms', '/legal/privacy'];
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
      changeFrequency: 'hourly' as const,
    })),
  ];
}
