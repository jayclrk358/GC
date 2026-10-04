import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import {
  docFromText,
  docToText,
  HISTORY_RANGES,
  RSVP_STATUSES,
  THREAD_SORTS,
  type RichNode,
} from '@gamecentral/shared';
import { z } from 'zod';
import { getMemberContext, loadChannel, type MemberContext } from '../access';
import { env } from '../env';
import { AppError, isAppError, notFound } from '../errors';
import { mediaUrl } from '../storage';
import { getChannelById, listVisibleChannels } from './channels';
import {
  deleteMessage,
  editMessage,
  getMessage,
  listMessages,
  listPins,
  sendMessage,
  toggleMessageReaction,
  type MessageView,
} from './chat';
import { communitiesForUser, exploreCommunities, getCommunityRow } from './communities';
import { getEventDetail, rsvpEvent, upcomingEvents } from './events';
import {
  createReply,
  createThread,
  getThread,
  listPosts,
  listThreads,
  recentThreads,
} from './forum';
import { endpointHistory } from './history';
import { listMembers } from './members';
import { getPublicProfile } from './profiles';
import { listRoles } from './roles';
import { getServerDetail, searchServers } from './server-browser';
import { listCommunityServers, type ServerView } from './servers';
import { getWikiPage, listWikiTree, type WikiTreeNode } from './wiki';

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
  return getMemberContext({ id: ref.communityId }, userId).catch((e: unknown) => {
    throw isAppError(e) && e.code === 'not_found' ? notFound('Channel') : e;
  });
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

function toApiMessage(m: MessageView) {
  return {
    id: m.id,
    channelId: m.channelId,
    kind: m.kind,
    content: m.content,
    author: m.author
      ? {
          id: m.author.id,
          name: m.author.nickname ?? m.author.name,
          username: m.author.username,
          avatarUrl: m.author.image,
        }
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
    messages: page.messages.map(toApiMessage),
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
  return toApiMessage(view);
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

// ── Things found by id: the community they're in, for the token's owner ──────────────────────

const uuid = z.string().uuid();

/** The community a message, thread or event is in (or not found, without saying which). */
async function contextOf(
  kind: 'Message' | 'Thread' | 'Event',
  id: string,
  userId: string,
): Promise<MemberContext> {
  if (!uuid.safeParse(id).success) throw notFound(kind);
  const table =
    kind === 'Message' ? schema.messages : kind === 'Thread' ? schema.threads : schema.events;
  const [row] = await db
    .select({ communityId: table.communityId })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row) throw notFound(kind);
  // In a community the token's owner can't see, it isn't there at all (not "Community not found",
  // which would confirm the id exists).
  return getMemberContext({ id: row.communityId }, userId).catch((e: unknown) => {
    throw isAppError(e) && e.code === 'not_found' ? notFound(kind) : e;
  });
}

export const apiMessageContext = (id: string, userId: string) => contextOf('Message', id, userId);
export const apiThreadContext = (id: string, userId: string) => contextOf('Thread', id, userId);
export const apiEventContext = (id: string, userId: string) => contextOf('Event', id, userId);

const page = (max = 1000) => z.coerce.number().int().min(0).max(max).default(0);

// ── People ───────────────────────────────────────────────────────────────────────────────────

export async function apiUser(username: string, viewerId: string) {
  if (!/^[a-z0-9_]{2,32}$/i.test(username)) throw notFound('User');
  const p = await getPublicProfile(username, viewerId);
  if (!p) throw notFound('User');
  return {
    id: p.id,
    name: p.name,
    username: p.username,
    avatarUrl: p.image,
    bannerUrl: p.bannerUrl,
    bio: p.bio,
    pronouns: p.pronouns,
    status: p.status,
    location: p.location,
    timezone: p.timezone,
    languages: p.languages,
    platforms: p.platforms,
    lookingForGroup: p.lookingForGroup,
    nowPlaying: p.nowPlaying?.name ?? null,
    games: p.games.map((g) => g.name),
    links: p.links,
    communities: p.communities.map((c) => ({ slug: c.slug, name: c.name })),
    staff: Boolean(p.staffRole),
    createdAt: p.createdAt.toISOString(),
    url: `${site()}/u/${p.username}`,
  };
}

// ── The community directory, members and roles ───────────────────────────────────────────────

const directoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  game: z.string().max(64).optional(),
  tag: z.string().max(32).optional(),
  region: z.string().max(32).optional(),
  language: z.string().max(16).optional(),
  sort: z.enum(['popular', 'new', 'relevance']).optional(),
  page: page(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

export async function apiCommunities(query: Record<string, string>) {
  const q = directoryQuery.parse(query);
  const result = await exploreCommunities({ ...q, pageSize: q.limit });
  return {
    communities: result.items.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      game: c.gameName,
      tags: c.tags,
      region: c.region,
      language: c.language,
      memberCount: c.memberCount,
      joinMode: c.joinMode,
      createdAt: c.createdAt.toISOString(),
      url: `${site()}/c/${c.slug}`,
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

const membersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.string().uuid().optional(),
  page: page(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function apiMembers(ctx: MemberContext, query: Record<string, string>) {
  const q = membersQuery.parse(query);
  const { members, hasMore } = await listMembers(ctx.community.id, ctx.community.ownerId, {
    q: q.q,
    roleId: q.role,
    limit: q.limit,
    offset: q.page * q.limit,
  });
  return {
    members: members.map((m) => ({
      id: m.userId,
      name: m.nickname || m.name,
      username: m.username,
      nickname: m.nickname,
      avatarUrl: m.image,
      roles: m.roleIds,
      owner: m.isOwner,
      joinedAt: m.joinedAt.toISOString(),
    })),
    page: q.page,
    pageSize: q.limit,
    hasMore,
  };
}

export async function apiRoles(ctx: MemberContext) {
  const roles = await listRoles(ctx.community.id);
  return {
    roles: [...roles]
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        iconUrl: mediaUrl(r.iconKey),
        position: r.position,
        everyone: r.isDefault,
        hoist: r.hoist,
        mentionable: r.mentionable,
        selfAssignable: r.selfAssignable,
      })),
  };
}

// ── Chat: single messages, edits, reactions, pins ────────────────────────────────────────────

export async function apiMessage(ctx: MemberContext, id: string) {
  const { message } = await getMessage(ctx, id);
  return toApiMessage(message);
}

const editSchema = z.object({ content: z.string().trim().min(1, 'Write something.').max(2000) });

export async function apiEditMessage(ctx: MemberContext, id: string, raw: unknown) {
  const input = editSchema.parse(raw);
  await editMessage(ctx, id, { body: docFromText(input.content) });
  return apiMessage(ctx, id);
}

export async function apiDeleteMessage(ctx: MemberContext, id: string) {
  await deleteMessage(ctx, id);
  return { id, deleted: true };
}

/** Add (or take back) the token owner's reaction; doing it twice changes nothing. */
export async function apiReact(ctx: MemberContext, id: string, rawEmoji: string, on: boolean) {
  let emoji = rawEmoji;
  try {
    emoji = decodeURIComponent(rawEmoji);
  } catch {
    // Already decoded.
  }
  const mine = (m: MessageView) => m.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
  const before = (await getMessage(ctx, id)).message;
  if (mine(before) !== on) await toggleMessageReaction(ctx, id, emoji);
  const after = (await getMessage(ctx, id)).message;
  return {
    emoji,
    reacted: mine(after),
    count: after.reactions.find((r) => r.emoji === emoji)?.count ?? 0,
  };
}

export async function apiPins(ctx: MemberContext, channelId: string) {
  return { messages: (await listPins(ctx, channelId)).map(toApiMessage) };
}

// ── Forums: a thread, its posts, starting threads and replying ───────────────────────────────

const threadUrl = (ctx: MemberContext, id: string) => `${site()}/c/${ctx.community.slug}/t/${id}`;

async function authorOf(userId: string | null) {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, username: true, image: true },
  });
  return user
    ? { id: user.id, name: user.name, username: user.username, avatarUrl: user.image }
    : null;
}

export async function apiThread(ctx: MemberContext, id: string) {
  const { thread, channel, flair } = await getThread(ctx, id);
  return {
    id: thread.id,
    title: thread.title,
    channel: { id: channel.id, name: channel.name },
    author: await authorOf(thread.authorId),
    pinned: thread.pinned,
    locked: thread.locked,
    solved: Boolean(thread.solutionPostId),
    score: thread.score,
    replyCount: thread.replyCount,
    flair: flair?.name ?? null,
    createdAt: thread.createdAt.toISOString(),
    lastActivityAt: thread.lastActivityAt.toISOString(),
    url: threadUrl(ctx, thread.id),
  };
}

const postsQuery = z.object({
  page: page(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Plain text with a blank line between paragraphs, the way the API takes text in. */
function textOf(body: RichNode | null): string | null {
  if (!body) return null;
  return (body.content ?? [])
    .map((block) => docToText(block))
    .filter(Boolean)
    .join('\n\n');
}

export async function apiPosts(
  ctx: MemberContext,
  threadId: string,
  query: Record<string, string>,
) {
  const q = postsQuery.parse(query);
  const result = await listPosts(ctx, threadId, { page: q.page, pageSize: q.limit });
  return {
    posts: result.posts.map((p) => ({
      id: p.id,
      op: p.isOp,
      content: p.deleted ? null : textOf(p.body),
      author: p.author.id
        ? {
            id: p.author.id,
            name: p.author.nickname || p.author.name,
            username: p.author.username,
            avatarUrl: p.author.image,
          }
        : null,
      replyToId: p.replyToId,
      reactions: p.reactions.map((r) => ({ emoji: r.emoji, count: r.count })),
      deleted: p.deleted,
      editedAt: p.editedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

const newThreadSchema = z.object({
  channelId: z.string().uuid('channelId must be a forum channel’s id.'),
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  content: z.string().trim().min(1, 'Write something.').max(20_000),
});

export async function apiCreateThread(ctx: MemberContext, raw: unknown) {
  const input = newThreadSchema.parse(raw);
  const { id } = await createThread(ctx, {
    channelId: input.channelId,
    title: input.title,
    body: docFromText(input.content),
  });
  return apiThread(ctx, id);
}

const replySchema = z.object({
  content: z.string().trim().min(1, 'Write something.').max(20_000),
  replyToId: z.string().uuid().nullable().optional(),
});

export async function apiReply(ctx: MemberContext, threadId: string, raw: unknown) {
  const input = replySchema.parse(raw);
  const { id } = await createReply(ctx, threadId, {
    body: docFromText(input.content),
    replyToId: input.replyToId ?? null,
  });
  const [post] = await db
    .select({ createdAt: schema.posts.createdAt, body: schema.posts.body })
    .from(schema.posts)
    .where(and(eq(schema.posts.id, id), isNull(schema.posts.deletedAt)))
    .limit(1);
  return {
    id,
    threadId,
    content: textOf((post?.body as RichNode | undefined) ?? null),
    author: await authorOf(ctx.userId),
    replyToId: input.replyToId ?? null,
    createdAt: (post?.createdAt ?? new Date()).toISOString(),
    url: `${threadUrl(ctx, threadId)}/p/${id}`,
  };
}

// ── Wiki ─────────────────────────────────────────────────────────────────────────────────────

export async function apiWikiPages(ctx: MemberContext) {
  const out: {
    id: string;
    slug: string;
    title: string;
    parentId: string | null;
    protected: boolean;
    url: string;
  }[] = [];
  const walk = (nodes: WikiTreeNode[]) => {
    for (const n of nodes) {
      out.push({
        id: n.id,
        slug: n.slug,
        title: n.title,
        parentId: n.parentId,
        protected: n.protected,
        url: `${site()}/c/${ctx.community.slug}/wiki/${n.slug}`,
      });
      walk(n.children);
    }
  };
  walk(await listWikiTree(ctx));
  return { pages: out };
}

export async function apiWikiPage(ctx: MemberContext, slug: string) {
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) throw notFound('Page');
  const p = await getWikiPage(ctx, slug);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    parentId: p.parentId,
    protected: p.protected,
    content: textOf(p.body as RichNode) ?? '',
    updatedBy: p.editorName,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    url: `${site()}/c/${ctx.community.slug}/wiki/${p.slug}`,
  };
}

// ── Events: one event, and answering it ──────────────────────────────────────────────────────

const atQuery = z.object({ at: z.string().datetime({ offset: true }).optional() });

export async function apiEvent(ctx: MemberContext, id: string, query: Record<string, string>) {
  const { at } = atQuery.parse(query);
  const d = await getEventDetail(ctx, id, at ? new Date(at) : null);
  return {
    id: d.event.id,
    title: d.event.title,
    description: d.event.description,
    location: d.event.location,
    timezone: d.event.timezone,
    allDay: d.event.allDay,
    capacity: d.event.capacity,
    repeats: d.event.recurrence !== null,
    start: d.occurrence.start,
    end: d.occurrence.end,
    upcoming: d.upcoming,
    going: d.going,
    maybe: d.maybe,
    full: d.full,
    cancelled: d.cancelled,
    ended: d.ended,
    attendees: d.attendees.map((a) => ({
      id: a.id,
      name: a.name,
      username: a.username,
      status: a.status,
    })),
    you: { rsvp: d.mine, canRsvp: d.canRsvp },
    url: `${site()}/c/${ctx.community.slug}/events/${d.event.id}?at=${encodeURIComponent(d.occurrence.start)}`,
  };
}

const rsvpBody = z.object({
  status: z.enum(RSVP_STATUSES).nullable(),
  at: z.string().datetime({ offset: true }).optional(),
});

export async function apiRsvp(ctx: MemberContext, id: string, raw: unknown) {
  const input = rsvpBody.parse(raw);
  const at = input.at ?? (await getEventDetail(ctx, id)).occurrence.start;
  const result = await rsvpEvent(ctx, id, new Date(at), input.status);
  return {
    start: new Date(at).toISOString(),
    going: result.going,
    maybe: result.maybe,
    you: result.mine,
  };
}

// ── The server browser and player history ────────────────────────────────────────────────────

export async function apiServerSearch(query: Record<string, string>) {
  const result = await searchServers(query);
  return {
    servers: result.items.map((s) => ({
      ...apiServerView(s),
      community: s.community ? { slug: s.community.slug, name: s.community.name } : null,
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

const historyQuery = z.object({ range: z.enum(HISTORY_RANGES).default('24h') });

export async function apiServerHistory(id: string, userId: string, query: Record<string, string>) {
  if (!uuid.safeParse(id).success) throw notFound('Server');
  const { range } = historyQuery.parse(query);
  // Same visibility as the server's page: listed servers, or your own.
  const server = await getServerDetail(id, userId);
  return endpointHistory(server.endpointId, range);
}
