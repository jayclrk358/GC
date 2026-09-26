import 'server-only';
import { notFound } from 'next/navigation';
import { getWikiPage, isAppError } from '@magnox/core';
import { loadCommunity } from '@/lib/community';

export async function loadWikiPage(slug: string, pageSlug: string) {
  const data = await loadCommunity(slug);
  try {
    return { data, page: await getWikiPage(data.ctx, decodeURIComponent(pageSlug)) };
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
}
