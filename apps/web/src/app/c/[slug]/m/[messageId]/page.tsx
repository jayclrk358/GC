import { notFound, redirect } from 'next/navigation';
import { getMessage, isAppError } from '@magnox/core';
import { loadCommunity } from '@/lib/community';

/** Chat message permalink: opens the channel scrolled to the message. */
export default async function MessagePermalink({
  params,
}: {
  params: Promise<{ slug: string; messageId: string }>;
}) {
  const { slug, messageId } = await params;
  const data = await loadCommunity(slug);
  let channelName: string;
  try {
    channelName = (await getMessage(data.ctx, messageId)).channel.name;
  } catch (e) {
    if (isAppError(e) && (e.code === 'not_found' || e.code === 'forbidden')) notFound();
    throw e;
  }
  redirect(`/c/${slug}/chat/${channelName}?m=${messageId}`);
}
