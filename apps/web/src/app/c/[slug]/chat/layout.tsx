import { planLimits, planPerks } from '@magnox/shared';
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
  const perks = planPerks(data.community.plan);
  const [{ tree }, unreads] = await Promise.all([loadChatChannels(slug), loadChatUnreads(slug)]);
  return (
    // Fills what's left of the window under the community header (see DenseOnChat).
    // A chat app inside the page: channels on the left, then the channel (and its members).
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-ui-lg border border-border bg-surface shadow-sm md:flex-row">
      <ChannelSidebar
        slug={slug}
        communityName={data.community.name}
        user={
          data.user
            ? {
                id: data.user.id,
                name: data.user.name,
                username: data.user.username ?? null,
                image: data.user.image ?? null,
              }
            : null
        }
        voiceLimit={planLimits(data.community.plan).voiceParticipants}
        categories={tree.categories
          .map((c) => ({
            id: c.id,
            name: c.name,
            // Separators are a paid perk: kept, but not shown, on Free.
            channels: c.channels
              .filter((ch) => ch.type !== 'separator' || perks.separators)
              .map((ch) => ({
                id: ch.id,
                name: ch.name,
                type: ch.type as 'text' | 'voice' | 'separator',
              })),
          }))
          .filter((c) => c.channels.some((ch) => ch.type !== 'separator'))}
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
