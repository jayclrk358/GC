import { loadChatChannels, loadChatUnreads, loadCommunity } from '@/lib/community';
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
  const [{ tree }, unreads] = await Promise.all([loadChatChannels(slug), loadChatUnreads(slug)]);
  return (
    // Fills what's left of the window under the community header (see DenseOnChat).
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-ui-lg border border-border bg-surface md:flex-row">
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
