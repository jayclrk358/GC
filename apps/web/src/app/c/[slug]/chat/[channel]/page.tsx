import { getTranslations } from 'next-intl/server';
import { channelUnreads, isMuted, listBlockedUsers, listMessages } from '@magnox/core';
import { has, isUuid, Permission, planLimits } from '@magnox/shared';
import { loadChatChannel, loadCommunity } from '@/lib/community';
import { formatDateTime } from '@/lib/format';
import { JoinButton } from '@/components/community/join-button';
import { ChatNotice, ChatView, SignInToChat } from '@/components/chat/chat-view';

type Params = Promise<{ slug: string; channel: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: `#${decodeURIComponent((await params).channel)}` };
}

export default async function ChatChannelPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug, channel: name } = await params;
  const focus = (await searchParams).m;
  const focusId = focus && isUuid(focus) ? focus : null;
  const data = await loadCommunity(slug);
  const channel = await loadChatChannel(data.ctx, name);
  const t = await getTranslations('chat');
  const perms = BigInt(channel.perms);
  const user = data.user;
  const member = data.ctx.isMember;

  const unread = (await channelUnreads(data.ctx, [channel.id])).get(channel.id);
  const lastReadId = unread?.unread ? unread.lastReadId : null;
  const [initial, blocked, muted] = await Promise.all([
    listMessages(
      data.ctx,
      channel.id,
      focusId ? { around: focusId } : lastReadId ? { around: lastReadId } : {},
    ),
    user ? listBlockedUsers(user.id) : [],
    user && member ? isMuted(user.id, 'channel', channel.id) : false,
  ]);

  const canSend = member && has(perms, Permission.SEND_MESSAGES);
  const notice = !user ? (
    <SignInToChat
      href={`/sign-in?next=${encodeURIComponent(`/c/${slug}/chat/${channel.name}`)}`}
      label={t('signIn')}
      text={t('signInToChat')}
    />
  ) : !member ? (
    <ChatNotice
      action={
        <JoinButton
          communityId={data.community.id}
          signedIn
          isMember={false}
          isOwner={false}
          joinMode={data.community.joinMode}
          visibility={data.community.visibility}
        />
      }
    >
      {t('joinToChat')}
    </ChatNotice>
  ) : data.ctx.timedOut && data.ctx.timeoutUntil ? (
    <ChatNotice>{t('timedOut', { date: formatDateTime(data.ctx.timeoutUntil) })}</ChatNotice>
  ) : (
    <ChatNotice>{t('cannotSend')}</ChatNotice>
  );

  return (
    <ChatView
      key={`${channel.id}:${focusId ?? ''}`}
      communityId={data.community.id}
      slug={slug}
      channel={{
        id: channel.id,
        name: channel.name,
        topic: channel.topic,
        slowmodeSeconds: channel.slowmodeSeconds,
      }}
      me={
        user
          ? {
              id: user.id,
              name: user.name,
              username: (user as { username?: string | null }).username ?? null,
              image: user.image ?? null,
              roleIds: data.ctx.roleIds,
            }
          : null
      }
      perms={{
        signedIn: Boolean(user),
        member,
        send: canSend,
        react: member && has(perms, Permission.ADD_REACTIONS),
        attach: member && has(perms, Permission.ATTACH_FILES),
        manage: has(perms, Permission.MANAGE_MESSAGES),
        history: has(perms, Permission.READ_HISTORY),
        timedOutUntil: data.ctx.timeoutUntil?.toISOString() ?? null,
        maxAttachments: planLimits(data.community.plan).attachments,
        maxVideoMb: planLimits(data.community.plan).videoMb,
      }}
      blocked={blocked.map((b) => b.userId)}
      initial={initial}
      lastReadId={focusId ? null : lastReadId}
      muted={muted}
      requireAlt={Boolean(data.community.settings.requireAltText)}
      focusMessageId={focusId}
      notice={canSend ? null : notice}
    />
  );
}
