import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getWikiPage, isAppError, listWikiTree } from '@gamecentral/core';
import { loadCommunity } from '@/lib/community';

/** A wiki page, loaded once per request however many times it's asked for (title, page). */
export const loadWikiPage = cache(async (slug: string, pageSlug: string) => {
  const data = await loadCommunity(slug);
  try {
    return { data, page: await getWikiPage(data.ctx, decodeURIComponent(pageSlug)) };
  } catch (e) {
    if (isAppError(e) && e.code === 'not_found') notFound();
    throw e;
  }
});

/** The page tree, loaded once per request (the wiki layout and its pages both show it). */
export const loadWikiTree = cache(async (slug: string) =>
  listWikiTree((await loadCommunity(slug)).ctx),
);
