import { channelUnreads, listVisibleChannels } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { ChannelSidebar } from '@/components/chat/sidebar';

export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCommunity(slug);
  const { tree, channels } = await listVisibleChannels(data.ctx, { types: ['text'] });
  const unreads = await channelUnreads(
    data.ctx,
    channels.map((c) => c.id),
  );
  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[26rem] flex-col overflow-hidden rounded-ui-lg border border-border bg-surface md:flex-row">
      <ChannelSidebar
        slug={slug}
        categories={tree.categories
          .filter((c) => c.channels.length)
          .map((c) => ({
            id: c.id,
            name: c.name,
            channels: c.channels.map((ch) => ({ id: ch.id, name: ch.name })),
          }))}
        initialUnreads={Object.fromEntries(
          [...unreads].map(([id, u]) => [id, { unread: u.unread, mentions: u.mentions }]),
        )}
        me={data.user && data.ctx.isMember ? { id: data.user.id, roleIds: data.ctx.roleIds } : null}
        canManage={data.perms.manageChannels}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
