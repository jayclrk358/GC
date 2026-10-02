import { eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { docFromText, THREAD_SORTS } from '@magnox/shared';
import { z } from 'zod';
import { getMemberContext, loadChannel, type MemberContext } from '../access';
import { env } from '../env';
import { AppError, notFound } from '../errors';
import { mediaUrl } from '../storage';
import { getChannelById, listVisibleChannels } from './channels';
import { listMessages, sendMessage, type MessageView } from './chat';
import { communitiesForUser, getCommunityRow } from './communities';
import { upcomingEvents } from './events';
import { listThreads, recentThreads } from './forum';
import { getServerDetail } from './server-browser';
import { listCommunityServers, type ServerView } from './servers';

// The public API (v1): stable, documented shapes over the same services the site uses. Every call
// acts as the token's owner, with exactly their access.

const site = () => env().APP_URL.replace(/\/$/, '');

export async function apiMe(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, username: true },
  });
  if (!user) throw notFound('User');
  const communities = await communitiesForUser(userId);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    communities: communities.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      owner: c.ownerId === userId,
    })),
  };
}

/** A community the token's owner can see, by slug. */
export function apiCommunityContext(slug: string, userId: string): Promise<MemberContext> {
  return getMemberContext({ slug }, userId);
}

/** The community a channel is in, for the token's owner. */
export async function apiChannelContext(channelId: string, userId: string) {
  if (!z.string().uuid().safeParse(channelId).success) throw notFound('Channel');
  const ref = await loadChannel(channelId);
  if (!ref) throw notFound('Channel');
  return getMemberContext({ id: ref.communityId }, userId);
}

export async function apiCommunity(ctx: MemberContext) {
  const row = await getCommunityRow(ctx.community.id);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    memberCount: row.memberCount,
    visibility: row.visibility,
    joinMode: row.joinMode,
    archived: ctx.community.archived,
    url: `${site()}/c/${row.slug}`,
    you: { member: ctx.isMember, owner: ctx.isOwner },
  };
}

export async function apiChannels(ctx: MemberContext) {
  const { channels } = await listVisibleChannels(ctx);
  return channels
    .filter((c) => c.type !== 'separator')
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      topic: c.topic,
      position: c.position,
    }));
}

function apiMessage(m: MessageView) {
  return {
    id: m.id,
    channelId: m.channelId,
    kind: m.kind,
    content: m.content,
    author: m.author
      ? { id: m.author.id, name: m.author.nickname ?? m.author.name, username: m.author.username }
      : null,
    replyToId: m.replyTo?.id ?? null,
    attachments: m.attachments.map((a) => ({
      url: mediaUrl(a.key),
      alt: a.alt,
      width: a.width,
      height: a.height,
    })),
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, count: r.count })),
    pinned: m.pinned,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
  };
}

const messagesQuery = z.object({
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function apiMessages(
  ctx: MemberContext,
  channelId: string,
  query: Record<string, string>,
) {
  const q = messagesQuery.parse(query);
  const page = await listMessages(ctx, channelId, q);
  return {
    messages: page.messages.map(apiMessage),
    hasMoreBefore: page.hasMoreBefore,
    hasMoreAfter: page.hasMoreAfter,
  };
}

const sendSchema = z.object({
  content: z.string().trim().min(1, 'Write something.').max(2000),
  replyToId: z.string().uuid().nullable().optional(),
  nonce: z
    .string()
    .regex(/^[a-zA-Z0-9-]{8,64}$/)
    .optional(),
});

export async function apiSendMessage(ctx: MemberContext, channelId: string, raw: unknown) {
  const input = sendSchema.parse(raw);
  const view = await sendMessage(ctx, channelId, {
    body: docFromText(input.content),
    replyToId: input.replyToId ?? null,
    nonce: input.nonce,
  });
  return apiMessage(view);
}

const threadsQuery = z.object({
  channel: z.string().uuid().optional(),
  sort: z.enum(THREAD_SORTS).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function apiThreads(ctx: MemberContext, query: Record<string, string>) {
  const q = threadsQuery.parse(query);
  const base = `${site()}/c/${ctx.community.slug}/t`;
  if (!q.channel) {
    const rows = await recentThreads(ctx, { count: 10 });
    return {
      threads: rows.map((t) => ({
        id: t.id,
        title: t.title,
        channel: t.channelName,
        author: t.authorName,
        replyCount: t.replyCount,
        lastActivityAt: t.lastActivityAt.toISOString(),
        url: `${base}/${t.id}`,
      })),
    };
  }
  const channel = await getChannelById(ctx, q.channel);
  if (channel.type !== 'forum' && channel.type !== 'announcement') {
    throw new AppError('bad_request', 'That channel isn’t a forum.');
  }
  const page = await listThreads(ctx, channel, { sort: q.sort, page: q.page });
  return {
    threads: page.items.map((t) => ({
      id: t.id,
      title: t.title,
      channel: channel.name,
      author: t.author?.name ?? null,
      pinned: t.pinned,
      locked: t.locked,
      solved: t.solved,
      score: t.score,
      replyCount: t.replyCount,
      flair: t.flair?.name ?? null,
      createdAt: t.createdAt.toISOString(),
      lastActivityAt: t.lastActivityAt.toISOString(),
      url: `${base}/${t.id}`,
    })),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
}

export async function apiEvents(ctx: MemberContext) {
  const list = await upcomingEvents(ctx, 50);
  return {
    events: list.map((e) => ({
      id: e.eventId,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      timezone: e.timezone,
      location: e.location,
      repeats: e.repeats,
      capacity: e.capacity,
      going: e.going,
      maybe: e.maybe,
      url: `${site()}/c/${ctx.community.slug}/events/${e.eventId}?at=${encodeURIComponent(e.start)}`,
    })),
  };
}

function apiServerView(s: ServerView) {
  return {
    id: s.id,
    name: s.name,
    game: s.protocolLabel,
    protocol: s.protocol,
    address: s.address,
    connectUrl: s.connectUrl,
    tags: s.tags,
    region: s.region,
    verified: s.verified,
    votes: s.voteCount,
    status: s.status,
    url: `${site()}/servers/${s.id}`,
  };
}

export async function apiServers(ctx: MemberContext) {
  const list = await listCommunityServers(ctx.community.id);
  return { servers: list.map(apiServerView) };
}

export async function apiServer(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) throw notFound('Server');
  const s = await getServerDetail(id, userId);
  return {
    ...apiServerView(s),
    lastOnlineAt: s.lastOnlineAt,
    downSince: s.downSince,
    votesThisMonth: s.votesThisMonth,
  };
}
