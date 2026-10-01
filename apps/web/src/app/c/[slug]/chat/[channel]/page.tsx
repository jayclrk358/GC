import { getTranslations } from 'next-intl/server';
import {
  isMuted,
  listBlockedUsers,
  listEmoji,
  listMessages,
  syncVoicePeople,
  voiceEnabled,
} from '@magnox/core';
import { has, isUuid, Permission, planLimits, planPerks } from '@magnox/shared';
import { imgSources } from '@/lib/media';
import { loadChatChannel, loadChatUnreads, loadCommunity } from '@/lib/community';
import { formatDateTime } from '@/lib/format';
import { JoinButton } from '@/components/community/join-button';
import { ChatNotice, ChatView, SignInToChat } from '@/components/chat/chat-view';
import { VoiceView, type VoiceBlock } from '@/components/voice/voice-view';

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
  const channel = await loadChatChannel(slug, name);
  const t = await getTranslations('chat');
  const perms = BigInt(channel.perms);
  const user = data.user;
  const member = data.ctx.isMember;

  if (channel.type === 'voice') {
    // Put the "who's here" list right if a LiveKit webhook was missed.
    await syncVoicePeople(channel.id);
    const blocked: VoiceBlock | null = !voiceEnabled()
      ? 'notSetUp'
      : !planLimits(data.community.plan).voiceChannels
        ? 'needsPlan'
        : !user
          ? 'signedOut'
          : !member
            ? 'notMember'
            : !has(perms, Permission.CONNECT)
              ? 'noPermission'
              : null;
    return (
      <VoiceView
        channel={{ id: channel.id, name: channel.name, topic: channel.topic }}
        slug={slug}
        blocked={blocked}
        canModerate={has(perms, Permission.MUTE_MEMBERS)}
      />
    );
  }

  const unread = (await loadChatUnreads(slug)).get(channel.id);
  const lastReadId = unread?.unread ? unread.lastReadId : null;
  const [initial, blocked, muted, emoji] = await Promise.all([
    listMessages(
      data.ctx,
      channel.id,
      focusId ? { around: focusId } : lastReadId ? { around: lastReadId } : {},
      channel,
    ),
    user ? listBlockedUsers(user.id) : [],
    user && member ? isMuted(user.id, 'channel', channel.id) : false,
    listEmoji(data.community.id),
  ]);

  const canSend = member && has(perms, Permission.SEND_MESSAGES);
  // Chat backgrounds are a paid perk: kept on Free, but not shown.
  const image = planPerks(data.community.plan).chatBackgrounds
    ? imgSources(channel.settings.backgroundKey, 'md', '(min-width: 1024px) 70vw, 100vw')
    : null;
  const background = image ? { image, dim: channel.settings.backgroundDim ?? 70 } : null;
  const notice = data.ctx.community.archived ? (
    <ChatNotice>{t('archivedNotice')}</ChatNotice>
  ) : !user ? (
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
          slug={data.community.slug}
          signedIn
          isMember={false}
          isOwner={false}
          joinMode={data.community.joinMode}
          visibility={data.community.visibility}
          archived={Boolean(data.community.archivedAt)}
        />
      }
    >
      {t('joinToChat')}
    </ChatNotice>
  ) : data.ctx.needsRules ? (
    <SignInToChat href={`/c/${slug}/welcome`} label={t('rulesFirstLink')} text={t('rulesFirst')} />
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
      background={background}
      emoji={emoji}
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
