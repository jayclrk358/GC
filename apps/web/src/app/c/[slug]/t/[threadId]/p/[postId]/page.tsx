import { notFound, redirect } from 'next/navigation';
import { isAppError, locatePost } from '@magnox/core';
import { loadCommunity } from '@/lib/community';

/** Post permalink: works however many replies have been added since it was shared. */
export default async function PostPermalink({
  params,
}: {
  params: Promise<{ slug: string; threadId: string; postId: string }>;
}) {
  const { slug, threadId, postId } = await params;
  const data = await loadCommunity(slug);
  let page: number;
  try {
    page = await locatePost(data.ctx, threadId, postId);
  } catch (e) {
    if (isAppError(e) && (e.code === 'not_found' || e.code === 'forbidden')) notFound();
    throw e;
  }
  redirect(`/c/${slug}/t/${threadId}${page ? `?page=${page}` : ''}#post-${postId}`);
}
