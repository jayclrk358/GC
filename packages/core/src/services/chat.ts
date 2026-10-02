import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db, schema, type MessageAttachment, type MessageEmbed } from '@magnox/db';
import {
  collectMentions,
  customReactionId,
  docToText,
  extractLinks,
  has,
  isChatReaction,
  MAX_MESSAGE_CHARS,
  messageEditSchema,
  messageInputSchema,
  nameStyleView,
  type NameStyleView,
  newId,
  parseSearchQuery,
  Permission,
  pickRoleDecor,
  planPerks,
  type RichNode,
  sanitizeDoc,
  themeBackdrops,
  toChatDoc,
  uuidAtTime,
} from '@magnox/shared';
import { z } from 'zod';
import type { MemberContext } from '../access';
import { cached } from '../cache';
import { AppError, forbidden, notFound, unauthorized } from '../errors';
import { realtime } from '../emitter';
import { QUEUES, enqueue } from '../queues';
import { enforceRateLimit } from '../ratelimit';
import { cacheRedis } from '../redis';
import { rooms } from '../rooms';
import { mediaUrl } from '../storage';
import { audit } from './audit';
import { enforceAutomod } from './automod';
import { communityLimits } from './billing';
import { isCommunityEmojiReaction } from './emoji';
import { getChannelById, listVisibleChannels, type ChannelView } from './channels';
import { queueMediaCleanup } from './media-cleanup';
import { queueFanout } from './notify';
import { emitChannelEvent, siteUrl, webhookUser } from './webhooks';

// ── Views ──────────────────────────────────────────────────────────────────

export interface ChatAuthor {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  nickname: string | null;
  roleColor: string | null;
  roleName: string | null;
  /** Nametag effect from their highest styled role, if any. */
  nameStyle: NameStyleView | null;
  /** Their highest role's own style, for showing the role name. */
  roleStyle: NameStyleView | null;
  /** Icon image of their highest role that has one. */
  roleIcon: { url: string; roleName: string } | null;
}

export interface ReplyPreview {
  id: string;
  authorId: string | null;
  authorName: string;
  authorStyle: NameStyleView | null;
  excerpt: string;
  deleted: boolean;
}

/** A message as sent to clients. Dates are ISO strings so it can go over a socket as-is. */
export interface MessageView {
  id: string;
  channelId: string;
  /** 'user', or a system notice such as 'server_down' / 'server_up' (no author). */
  kind: string;
  /** Details for system notices; null for normal messages. */
  meta: Record<string, unknown> | null;
  authorId: string | null;
  author: ChatAuthor | null;
  body: RichNode;
  content: string;
  replyTo: ReplyPreview | null;
  mentionUserIds: string[];
  mentionRoleIds: string[];
  mentionEveryone: boolean;
  attachments: MessageAttachment[];
  embeds: MessageEmbed[];
  reactions: { emoji: string; count: number; mine: boolean }[];
  pinned: boolean;
  editedAt: string | null;
  createdAt: string;
  nonce: string | null;
}

type MessageRow = typeof schema.messages.$inferSelect;

/** Display info for authors: nickname in this community and their highest role. */
export async function loadAuthors(
  communityId: string,
  ids: string[],
): Promise<Map<string, ChatAuthor>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, ChatAuthor>();
  if (!unique.length) return out;
  const [users, members, roles, [community]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        image: schema.users.image,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, unique)),
    db
      .select({ userId: schema.members.userId, nickname: schema.members.nickname })
      .from(schema.members)
      .where(
        and(eq(schema.members.communityId, communityId), inArray(schema.members.userId, unique)),
      ),
    db
      .select({
        userId: schema.memberRoles.userId,
        name: schema.roles.name,
        color: schema.roles.color,
        position: schema.roles.position,
        iconKey: schema.roles.iconKey,
        nameStyle: schema.roles.nameStyle,
        badgeStyle: schema.roles.badgeStyle,
      })
      .from(schema.memberRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
      .where(
        and(
          eq(schema.memberRoles.communityId, communityId),
          inArray(schema.memberRoles.userId, unique),
        ),
      ),
    db
      .select({ theme: schema.communities.theme, plan: schema.communities.plan })
      .from(schema.communities)
      .where(eq(schema.communities.id, communityId))
      .limit(1),
  ]);
  const backdrops = community ? themeBackdrops(community.theme) : undefined;
  const perks = planPerks(community?.plan);
  const nick = new Map(members.map((m) => [m.userId, m.nickname]));
  const top = new Map<string, (typeof roles)[number]>();
  const byUser = new Map<string, (typeof roles)[number][]>();
  for (const r of roles) {
    const cur = top.get(r.userId);
    if (!cur || r.position > cur.position) top.set(r.userId, r);
    byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  }
  for (const u of users) {
    const role = top.get(u.id);
    const decor = pickRoleDecor(byUser.get(u.id) ?? [], backdrops, perks);
    out.set(u.id, {
      id: u.id,
      name: u.name,
      username: u.username,
      image: u.image,
      nickname: nick.get(u.id) ?? null,
      roleColor: role?.color ?? null,
      roleName: role?.name ?? null,
      nameStyle: decor.nameStyle,
      roleStyle: role ? nameStyleView(role.color, role.badgeStyle, backdrops, perks) : null,
      roleIcon: decor.icon
        ? { url: mediaUrl(decor.icon.key)!, roleName: decor.icon.roleName }
        : null,
    });
  }
  return out;
}

const displayName = (a: ChatAuthor | undefined | null) => a?.nickname || a?.name || 'Deleted user';

function excerpt(text: string, max = 120) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function toViews(
  communityId: string,
  viewerId: string | null,
  rows: MessageRow[],
): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const parentIds = [
    ...new Set(rows.map((r) => r.replyToId).filter((x): x is string => Boolean(x))),
  ];
  const [reactions, parents] = await Promise.all([
    db
      .select({
        messageId: schema.messageReactions.messageId,
        emoji: schema.messageReactions.emoji,
        userId: schema.messageReactions.userId,
      })
      .from(schema.messageReactions)
      .where(inArray(schema.messageReactions.messageId, ids))
      .orderBy(asc(schema.messageReactions.createdAt)),
    parentIds.length
      ? db
          .select({
            id: schema.messages.id,
            authorId: schema.messages.authorId,
            content: schema.messages.content,
            deletedAt: schema.messages.deletedAt,
          })
          .from(schema.messages)
          .where(inArray(schema.messages.id, parentIds))
      : [],
  ]);
  const authorIds = [...rows.map((r) => r.authorId), ...parents.map((p) => p.authorId)].filter(
    (x): x is string => Boolean(x),
  );
  const authors = await loadAuthors(communityId, authorIds);
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const byMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of reactions) {
    const m = byMessage.get(r.messageId) ?? new Map<string, { count: number; mine: boolean }>();
    const e = m.get(r.emoji) ?? { count: 0, mine: false };
    e.count++;
    if (viewerId && r.userId === viewerId) e.mine = true;
    m.set(r.emoji, e);
    byMessage.set(r.messageId, m);
  }
  return rows.map((r) => {
    const parent = r.replyToId ? parentById.get(r.replyToId) : undefined;
    return {
      id: r.id,
      channelId: r.channelId,
      kind: r.kind,
      meta: r.meta ?? null,
      authorId: r.authorId,
      author: r.authorId ? (authors.get(r.authorId) ?? null) : null,
      body: r.body,
      content: r.content,
      replyTo: r.replyToId
        ? {
            id: r.replyToId,
            authorId: parent?.authorId ?? null,
            authorName: displayName(parent?.authorId ? authors.get(parent.authorId) : null),
            authorStyle: (parent?.authorId && authors.get(parent.authorId)?.nameStyle) || null,
            excerpt: parent && !parent.deletedAt ? excerpt(parent.content) : '',
            deleted: !parent || Boolean(parent.deletedAt),
          }
        : null,
      mentionUserIds: r.mentionUserIds,
      mentionRoleIds: r.mentionRoleIds,
      mentionEveryone: r.mentionEveryone,
      attachments: r.attachments,
      embeds: r.embeds,
      reactions: [...(byMessage.get(r.id) ?? new Map()).entries()].map(([emoji, v]) => ({
        emoji,
        ...v,
      })),
      pinned: Boolean(r.pinnedAt),
      editedAt: r.editedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      nonce: r.nonce,
    };
  });
}

// ── Channels ───────────────────────────────────────────────────────────────

/** A text channel the viewer can see. */
export async function getChatChannel(ctx: MemberContext, channelId: string): Promise<ChannelView> {
  const channel = await getChannelById(ctx, channelId);
  if (channel.type !== 'text') throw notFound('Channel');
  return channel;
}

export async function getChatChannelByName(ctx: MemberContext, name: string): Promise<ChannelView> {
  const { channels } = await listVisibleChannels(ctx, { types: ['text'] });
  const channel = channels.find((c) => c.name === name.toLowerCase());
  if (!channel) throw notFound('Channel');
  return channel;
}

const perm = (channel: ChannelView, flag: bigint) => has(BigInt(channel.perms), flag);

// ── Reading ────────────────────────────────────────────────────────────────

const pageSchema = z.object({
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  around: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export interface MessagePage {
  messages: MessageView[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  /** False when the viewer lacks Read message history: they only see messages live. */
  history: boolean;
}

export async function listMessages(
  ctx: MemberContext,
  channelId: string,
  rawOpts: unknown = {},
  /** The channel, when the caller has already loaded it for this member. */
  known?: ChannelView,
): Promise<MessagePage> {
  const opts = pageSchema.parse(rawOpts);
  const channel =
    known?.id === channelId && known.type === 'text' ? known : await getChatChannel(ctx, channelId);
  if (!perm(channel, Permission.READ_HISTORY)) {
    return { messages: [], hasMoreBefore: false, hasMoreAfter: false, history: false };
  }
  const base = and(eq(schema.messages.channelId, channel.id), isNull(schema.messages.deletedAt));
  const older = async (bound: SQL | undefined, n: number) =>
    db
      .select()
      .from(schema.messages)
      .where(and(base, bound))
      .orderBy(desc(schema.messages.id))
      .limit(n + 1);
  const newer = async (bound: SQL | undefined, n: number) =>
    db
      .select()
      .from(schema.messages)
      .where(and(base, bound))
      .orderBy(asc(schema.messages.id))
      .limit(n + 1);

  let rows: MessageRow[];
  let hasMoreBefore = false;
  let hasMoreAfter = false;
  if (opts.around) {
    const half = Math.floor(opts.limit / 2);
    const [b, a] = await Promise.all([
      older(lt(schema.messages.id, opts.around), half),
      newer(gte(schema.messages.id, opts.around), opts.limit - half),
    ]);
    hasMoreBefore = b.length > half;
    hasMoreAfter = a.length > opts.limit - half;
    rows = [...b.slice(0, half).reverse(), ...a.slice(0, opts.limit - half)];
  } else if (opts.after) {
    const a = await newer(gt(schema.messages.id, opts.after), opts.limit);
    hasMoreAfter = a.length > opts.limit;
    hasMoreBefore = true;
    rows = a.slice(0, opts.limit);
  } else {
    const b = await older(
      opts.before ? lt(schema.messages.id, opts.before) : undefined,
      opts.limit,
    );
    hasMoreBefore = b.length > opts.limit;
    hasMoreAfter = Boolean(opts.before);
    rows = b.slice(0, opts.limit).reverse();
  }
  return {
    messages: await toViews(ctx.community.id, ctx.userId, rows),
    hasMoreBefore,
    hasMoreAfter,
    history: true,
  };
}

/** One message, for jump links and notifications. */
export async function getMessage(
  ctx: MemberContext,
  messageId: string,
): Promise<{ message: MessageView; channel: ChannelView }> {
  const row = await db.query.messages.findFirst({
    where: and(
      eq(schema.messages.id, messageId),
      eq(schema.messages.communityId, ctx.community.id),
      isNull(schema.messages.deletedAt),
    ),
  });
  if (!row) throw notFound('Message');
  const channel = await getChatChannel(ctx, row.channelId);
  if (!perm(channel, Permission.READ_HISTORY)) throw notFound('Message');
  const [message] = await toViews(ctx.community.id, ctx.userId, [row]);
  return { message: message!, channel };
}

// ── Writing ────────────────────────────────────────────────────────────────

function prepareChatBody(raw: unknown): { body: RichNode; content: string } {
  const body = toChatDoc(sanitizeDoc(raw));
  const content = docToText(body, MAX_MESSAGE_CHARS + 100);
  if (content.length > MAX_MESSAGE_CHARS) {
    throw new AppError('validation', `Messages can be up to ${MAX_MESSAGE_CHARS} characters.`, {
      fields: { body: 'Too long' },
    });
  }
  return { body, content };
}

/** Mentions the author is allowed to make, as stored ids. */
async function resolveChatMentions(ctx: MemberContext, channel: ChannelView, body: RichNode) {
  const mentions = collectMentions(body);
  const canEveryone = perm(channel, Permission.MENTION_EVERYONE);
  const userIds = [...new Set(mentions.filter((m) => m.kind === 'user').map((m) => m.id))].slice(
    0,
    50,
  );
  const roleIds = [...new Set(mentions.filter((m) => m.kind === 'role').map((m) => m.id))]
    .filter((id) => /^[0-9a-f-]{36}$/.test(id))
    .slice(0, 10);
  const [members, roles] = await Promise.all([
    userIds.length
      ? db
          .select({ userId: schema.members.userId })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.communityId, ctx.community.id),
              inArray(schema.members.userId, userIds),
            ),
          )
      : [],
    roleIds.length
      ? db
          .select({
            id: schema.roles.id,
            mentionable: schema.roles.mentionable,
            isDefault: schema.roles.isDefault,
          })
          .from(schema.roles)
          .where(
            and(eq(schema.roles.communityId, ctx.community.id), inArray(schema.roles.id, roleIds)),
          )
      : [],
  ]);
  return {
    mentionUserIds: members.map((m) => m.userId),
    mentionRoleIds: roles
      .filter((r) => !r.isDefault && (r.mentionable || canEveryone))
      .map((r) => r.id),
    mentionEveryone: canEveryone && mentions.some((m) => m.kind === 'everyone'),
  };
}

/** Uploads that can be attached to a message (not avatars, banners and the like). */
const CHAT_UPLOAD_PURPOSES = new Set(['content', 'video']);

async function loadAttachments(
  ctx: MemberContext,
  input: { key: string; alt: string }[],
): Promise<MessageAttachment[]> {
  if (!input.length) return [];
  const rows = await db
    .select()
    .from(schema.uploads)
    .where(
      and(
        inArray(
          schema.uploads.key,
          input.map((a) => a.key),
        ),
        eq(schema.uploads.ownerId, ctx.userId!),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, ctx.community.id),
  });
  return input.map((a) => {
    const up = byKey.get(a.key);
    if (!up || !CHAT_UPLOAD_PURPOSES.has(up.purpose)) {
      throw new AppError('validation', 'An attachment is missing. Try uploading it again.');
    }
    const alt = (a.alt || up.alt || '').trim();
    if (!alt && community?.settings.requireAltText) {
      throw new AppError(
        'validation',
        'This community asks for a description (alt text) on every image.',
        {
          fields: { attachments: 'Alt text required' },
        },
      );
    }
    return {
      key: up.key,
      alt,
      width: up.width ?? 0,
      height: up.height ?? 0,
      animated: up.animated,
      posterKey: up.posterKey,
    };
  });
}

async function enforceChatSlowmode(ctx: MemberContext, channel: ChannelView) {
  if (!channel.slowmodeSeconds || perm(channel, Permission.MANAGE_MESSAGES)) return;
  await enforceRateLimit(
    `slowmode:${channel.id}:${ctx.userId}`,
    1,
    channel.slowmodeSeconds,
    `Slow mode is on: you can send one message every ${channel.slowmodeSeconds} seconds here.`,
  );
}

async function queuePreviews(messageId: string) {
  await enqueue(
    QUEUES.previews,
    'link-preview',
    { messageId },
    {
      jobId: `preview-${messageId}-${Date.now()}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 3000 },
    },
  );
}

/**
 * A new message goes in full to people with the channel open, and as a small ping to everyone
 * else who has it in their sidebar (enough for an unread dot and a mention badge).
 */
function publishNewMessage(channelId: string, view: MessageView) {
  realtime().to(rooms.chat(channelId)).emit('message:new', { channelId, message: view });
  realtime().to(rooms.channel(channelId)).except(rooms.chat(channelId)).emit('channel:activity', {
    channelId,
    id: view.id,
    authorId: view.authorId,
    mentionUserIds: view.mentionUserIds,
    mentionRoleIds: view.mentionRoleIds,
    mentionEveryone: view.mentionEveryone,
  });
}

export async function sendMessage(
  ctx: MemberContext,
  channelId: string,
  raw: unknown,
  /** A moderator approved it from the mod queue: it was checked and limited when first sent. */
  opts: { approved?: boolean } = {},
): Promise<MessageView> {
  if (!ctx.userId) throw unauthorized();
  const input = messageInputSchema.parse(raw);
  const channel = await getChatChannel(ctx, channelId);
  if (!ctx.isMember) throw forbidden('Join the community to chat.');
  if (!perm(channel, Permission.SEND_MESSAGES)) {
    throw forbidden(
      ctx.community.archived
        ? 'This community is archived, so it’s read-only.'
        : ctx.timedOut
          ? "You're timed out and can't send messages right now."
          : ctx.needsRules
            ? 'Accept the rules in the welcome steps to start chatting.'
            : "You can't send messages in this channel.",
    );
  }
  if (input.nonce) {
    const existing = await db.query.messages.findFirst({
      where: and(eq(schema.messages.authorId, ctx.userId), eq(schema.messages.nonce, input.nonce)),
    });
    if (existing) return (await toViews(ctx.community.id, ctx.userId, [existing]))[0]!;
  }
  if (input.attachments.length && !perm(channel, Permission.ATTACH_FILES)) {
    throw forbidden("You can't attach files in this channel.");
  }
  if (input.attachments.length) {
    const { attachments: max } = await communityLimits(ctx.community.id);
    if (input.attachments.length > max) {
      throw new AppError('validation', `You can attach up to ${max} files to a message here.`);
    }
  }
  const { body, content } = prepareChatBody(input.body);
  if (!content.trim() && !input.attachments.length) {
    throw new AppError('validation', 'Write something first.', { fields: { body: 'Empty' } });
  }
  if (!opts.approved) {
    await enforceRateLimit(`chat:${ctx.userId}`, 10, 10, "You're sending messages too quickly.");
    await enforceChatSlowmode(ctx, channel);
  }

  let replyAuthor: string | null = null;
  if (input.replyToId) {
    const parent = await db.query.messages.findFirst({
      where: and(
        eq(schema.messages.id, input.replyToId),
        eq(schema.messages.channelId, channel.id),
      ),
    });
    if (!parent || parent.deletedAt)
      throw new AppError('validation', 'The message you replied to was deleted.');
    replyAuthor = parent.authorId;
  }
  const attachments = await loadAttachments(ctx, input.attachments);
  const mentions = await resolveChatMentions(ctx, channel, body);
  // Replying pings the person replied to, unless the author turned that off.
  if (
    input.mentionReplied &&
    replyAuthor &&
    replyAuthor !== ctx.userId &&
    !mentions.mentionUserIds.includes(replyAuthor)
  ) {
    mentions.mentionUserIds.push(replyAuthor);
  }
  if (!opts.approved) {
    await enforceAutomod(ctx, {
      kind: 'message',
      channelId: channel.id,
      perms: BigInt(channel.perms),
      text: content,
      links: extractLinks(body, 50),
      mentions: collectMentions(body).length,
      payload: {
        body,
        attachments: input.attachments,
        replyToId: input.replyToId,
        mentionReplied: input.mentionReplied,
      },
    });
  }

  const id = newId();
  const now = new Date();
  const [row] = await db
    .insert(schema.messages)
    .values({
      id,
      channelId: channel.id,
      communityId: ctx.community.id,
      authorId: ctx.userId,
      body,
      content,
      replyToId: input.replyToId,
      ...mentions,
      attachments,
      nonce: input.nonce ?? null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    // Lost a race with a retry carrying the same nonce.
    const existing = await db.query.messages.findFirst({
      where: and(
        eq(schema.messages.authorId, ctx.userId),
        eq(schema.messages.nonce, input.nonce ?? ''),
      ),
    });
    if (!existing) throw new AppError('conflict', 'Message could not be sent. Try again.');
    return (await toViews(ctx.community.id, ctx.userId, [existing]))[0]!;
  }
  await Promise.all([
    db
      .update(schema.channels)
      .set({ lastMessageId: id, lastActivityAt: now })
      .where(eq(schema.channels.id, channel.id)),
    markRead(ctx.userId, channel.id, id),
  ]);
  const [view] = await toViews(ctx.community.id, ctx.userId, [row]);
  publishNewMessage(channel.id, view!);
  if (
    mentions.mentionUserIds.length ||
    mentions.mentionRoleIds.length ||
    mentions.mentionEveryone
  ) {
    await queueFanout({ kind: 'message', messageId: id });
  }
  if (perm(channel, Permission.EMBED_LINKS) && extractLinks(body).length) await queuePreviews(id);
  const authorId = ctx.userId;
  emitChannelEvent(ctx.community.id, channel, 'message.created', async () => ({
    message: {
      id,
      content: content.slice(0, 2000),
      url: siteUrl(`/c/${ctx.community.slug}/m/${id}`),
      createdAt: now.toISOString(),
    },
    author: await webhookUser(authorId),
  }));
  return view!;
}

/**
 * Post a notice from Magnox itself (no author), e.g. "Survival is down". It goes out live like any
 * other message but doesn't ping anyone.
 */
export async function postSystemMessage(
  communityId: string,
  channelId: string,
  notice: { kind: string; text: string; meta: object },
): Promise<MessageView> {
  const id = newId();
  const now = new Date();
  const body: RichNode = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: notice.text }] }],
  };
  const [row] = await db
    .insert(schema.messages)
    .values({
      id,
      channelId,
      communityId,
      authorId: null,
      kind: notice.kind,
      body,
      content: notice.text,
      meta: notice.meta as Record<string, unknown>,
      createdAt: now,
    })
    .returning();
  await db
    .update(schema.channels)
    .set({ lastMessageId: id, lastActivityAt: now })
    .where(eq(schema.channels.id, channelId));
  const [view] = await toViews(communityId, null, [row!]);
  publishNewMessage(channelId, view!);
  return view!;
}

async function loadOwnMessage(ctx: MemberContext, messageId: string) {
  const row = await db.query.messages.findFirst({
    where: and(
      eq(schema.messages.id, messageId),
      eq(schema.messages.communityId, ctx.community.id),
      isNull(schema.messages.deletedAt),
    ),
  });
  if (!row) throw notFound('Message');
  const channel = await getChatChannel(ctx, row.channelId);
  return { row, channel };
}

export async function editMessage(
  ctx: MemberContext,
  messageId: string,
  raw: unknown,
): Promise<void> {
  if (!ctx.userId) throw unauthorized();
  const { row, channel } = await loadOwnMessage(ctx, messageId);
  if (row.authorId !== ctx.userId) throw forbidden('You can only edit your own messages.');
  if (!perm(channel, Permission.SEND_MESSAGES))
    throw forbidden("You can't send messages in this channel.");
  const input = messageEditSchema.parse(raw);
  const { body, content } = prepareChatBody(input.body);
  if (!content.trim() && !row.attachments.length) {
    throw new AppError('validation', 'A message needs some text. Delete it instead.');
  }
  await enforceRateLimit(`chat-edit:${ctx.userId}`, 20, 60);
  const mentions = await resolveChatMentions(ctx, channel, body);
  await enforceAutomod(ctx, {
    kind: 'message',
    channelId: channel.id,
    perms: BigInt(channel.perms),
    text: content,
    links: extractLinks(body, 50),
    mentions: collectMentions(body).length,
    payload: {},
    edit: true,
  });
  // Keep a reply ping that was already there.
  const replyPing = row.mentionUserIds.filter(
    (id) => !collectMentions(row.body).some((m) => m.id === id),
  );
  const editedAt = new Date();
  const linksChanged = extractLinks(body).join(' ') !== extractLinks(row.body).join(' ');
  const patch = {
    body,
    content,
    editedAt,
    mentionUserIds: [...new Set([...mentions.mentionUserIds, ...replyPing])],
    mentionRoleIds: mentions.mentionRoleIds,
    mentionEveryone: mentions.mentionEveryone,
    ...(linksChanged ? { embeds: [] as MessageEmbed[] } : {}),
  };
  await db.update(schema.messages).set(patch).where(eq(schema.messages.id, row.id));
  realtime()
    .to(rooms.chat(channel.id))
    .emit('message:updated', {
      channelId: channel.id,
      id: row.id,
      patch: { ...patch, editedAt: editedAt.toISOString() },
    });
  if (linksChanged && perm(channel, Permission.EMBED_LINKS) && extractLinks(body).length)
    await queuePreviews(row.id);
}

export async function deleteMessage(ctx: MemberContext, messageId: string): Promise<void> {
  if (!ctx.userId) throw unauthorized();
  const { row, channel } = await loadOwnMessage(ctx, messageId);
  const own = row.authorId === ctx.userId;
  if (!own && !perm(channel, Permission.MANAGE_MESSAGES)) throw forbidden();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.messages)
      .set({ deletedAt: new Date(), pinnedAt: null })
      .where(eq(schema.messages.id, row.id));
    if (!own) {
      await audit(tx, {
        communityId: ctx.community.id,
        actorId: ctx.userId,
        action: 'message.delete',
        targetType: 'message',
        targetId: row.id,
        diff: { channel: channel.name, excerpt: excerpt(row.content, 200) },
      });
    }
  });
  realtime()
    .to(rooms.chat(channel.id))
    .emit('message:deleted', { channelId: channel.id, id: row.id });
  if (row.attachments.length) {
    await queueMediaCleanup({
      kind: 'refs',
      refs: row.attachments.map((a) => ({ key: a.key, authorId: row.authorId })),
    });
  }
}

export async function toggleMessageReaction(
  ctx: MemberContext,
  messageId: string,
  emoji: string,
): Promise<{ added: boolean }> {
  if (!ctx.userId) throw unauthorized();
  if (!isChatReaction(emoji) && !customReactionId(emoji))
    throw new AppError('validation', 'Pick one of the available reactions.');
  const { row, channel } = await loadOwnMessage(ctx, messageId);
  await enforceRateLimit(`react:${ctx.userId}`, 60, 60);
  const key = and(
    eq(schema.messageReactions.messageId, row.id),
    eq(schema.messageReactions.userId, ctx.userId),
    eq(schema.messageReactions.emoji, emoji),
  );
  const existing = await db.query.messageReactions.findFirst({ where: key });
  if (existing) await db.delete(schema.messageReactions).where(key);
  else {
    if (!perm(channel, Permission.ADD_REACTIONS))
      throw forbidden("You can't react in this channel.");
    // A custom emoji has to be one of this community's (taking one off is fine even once it's gone).
    if (customReactionId(emoji) && !(await isCommunityEmojiReaction(ctx.community.id, emoji)))
      throw new AppError('validation', 'That emoji isn’t available here.');
    const distinct = await db
      .selectDistinct({ emoji: schema.messageReactions.emoji })
      .from(schema.messageReactions)
      .where(eq(schema.messageReactions.messageId, row.id));
    if (distinct.length >= 20 && !distinct.some((d) => d.emoji === emoji)) {
      throw new AppError(
        'validation',
        'This message has as many different reactions as it can hold.',
      );
    }
    await db
      .insert(schema.messageReactions)
      .values({ messageId: row.id, userId: ctx.userId, emoji })
      .onConflictDoNothing();
  }
  const counts = await db
    .select({
      emoji: schema.messageReactions.emoji,
      count: sql<number>`count(*)::int`,
      first: sql<Date>`min(${schema.messageReactions.createdAt})`,
    })
    .from(schema.messageReactions)
    .where(eq(schema.messageReactions.messageId, row.id))
    .groupBy(schema.messageReactions.emoji)
    .orderBy(sql`min(${schema.messageReactions.createdAt})`);
  realtime()
    .to(rooms.chat(channel.id))
    .emit('message:reactions', {
      channelId: channel.id,
      id: row.id,
      reactions: counts.map((c) => ({ emoji: c.emoji, count: c.count })),
      actorId: ctx.userId,
      emoji,
      added: !existing,
    });
  return { added: !existing };
}

const MAX_PINS = 50;

export async function setMessagePinned(
  ctx: MemberContext,
  messageId: string,
  pinned: boolean,
): Promise<void> {
  if (!ctx.userId) throw unauthorized();
  const { row, channel } = await loadOwnMessage(ctx, messageId);
  if (!perm(channel, Permission.MANAGE_MESSAGES))
    throw forbidden('Only moderators can pin messages.');
  if (pinned && !row.pinnedAt) {
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.channelId, channel.id),
          isNotNull(schema.messages.pinnedAt),
          isNull(schema.messages.deletedAt),
        ),
      );
    if ((n?.n ?? 0) >= MAX_PINS)
      throw new AppError(
        'validation',
        `A channel can have up to ${MAX_PINS} pins. Unpin one first.`,
      );
  }
  await db
    .update(schema.messages)
    .set({ pinnedAt: pinned ? new Date() : null, pinnedBy: pinned ? ctx.userId : null })
    .where(eq(schema.messages.id, row.id));
  realtime()
    .to(rooms.chat(channel.id))
    .emit('message:updated', { channelId: channel.id, id: row.id, patch: { pinned } });
}

export async function listPins(ctx: MemberContext, channelId: string): Promise<MessageView[]> {
  const channel = await getChatChannel(ctx, channelId);
  if (!perm(channel, Permission.READ_HISTORY)) return [];
  const rows = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.channelId, channel.id),
        isNotNull(schema.messages.pinnedAt),
        isNull(schema.messages.deletedAt),
      ),
    )
    .orderBy(desc(schema.messages.pinnedAt))
    .limit(MAX_PINS);
  return toViews(ctx.community.id, ctx.userId, rows);
}

// ── Read state ─────────────────────────────────────────────────────────────

async function markRead(userId: string, channelId: string, messageId: string) {
  await db
    .insert(schema.readStates)
    .values({ userId, channelId, lastReadId: messageId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.readStates.userId, schema.readStates.channelId],
      set: {
        lastReadId: sql`greatest(${schema.readStates.lastReadId}, excluded.last_read_id)`,
        updatedAt: new Date(),
      },
    });
}

/** Mark a channel read up to a message; other tabs and devices hear about it too. */
export async function ackChannel(
  ctx: MemberContext,
  channelId: string,
  messageId: string,
): Promise<void> {
  if (!ctx.userId || !ctx.isMember) return;
  z.string().uuid().parse(messageId);
  const channel = await getChatChannel(ctx, channelId);
  await markRead(ctx.userId, channel.id, messageId);
  realtime()
    .to(rooms.user(ctx.userId))
    .emit('channel:read', { channelId: channel.id, lastReadId: messageId });
}

export interface ChannelUnread {
  unread: boolean;
  mentions: number;
  /** Everything after this id is new to the viewer. */
  lastReadId: string;
}

const uuidArray = (ids: string[]) =>
  ids.length
    ? sql`ARRAY[${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )}]::uuid[]`
    : sql`'{}'::uuid[]`;

/**
 * Unread state for text channels. Messages from before the viewer joined never count, and
 * mention counts stop at 100 (the UI shows "99+").
 */
export async function channelUnreads(
  ctx: MemberContext,
  channelIds: string[],
): Promise<Map<string, ChannelUnread>> {
  const out = new Map<string, ChannelUnread>();
  if (!ctx.userId || !ctx.isMember || !channelIds.length) return out;
  const member = await db.query.members.findFirst({
    where: and(
      eq(schema.members.communityId, ctx.community.id),
      eq(schema.members.userId, ctx.userId),
    ),
  });
  const joined = uuidAtTime(member?.joinedAt ?? new Date());
  const roles = uuidArray(ctx.roleIds);
  const rows = await db.execute<{
    id: string;
    last_message_id: string | null;
    baseline: string;
    mentions: number;
  }>(sql`
    select c.id, c.last_message_id,
      greatest(coalesce(rs.last_read_id, ${joined}::uuid), ${joined}::uuid)::text as baseline,
      (select count(*)::int from (
        select 1 from messages m
        where m.channel_id = c.id
          and m.id > greatest(coalesce(rs.last_read_id, ${joined}::uuid), ${joined}::uuid)
          and m.deleted_at is null
          and m.author_id is distinct from ${ctx.userId}
          and (m.mention_everyone or ${ctx.userId} = any(m.mention_user_ids) or m.mention_role_ids && ${roles})
        limit 100
      ) x) as mentions
    from channels c
    left join read_states rs on rs.channel_id = c.id and rs.user_id = ${ctx.userId}
    where c.id in (${sql.join(
      channelIds.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})
  `);
  for (const r of rows) {
    out.set(r.id, {
      unread: Boolean(r.last_message_id && r.last_message_id > r.baseline),
      mentions: Number(r.mentions),
      lastReadId: r.baseline,
    });
  }
  return out;
}

// ── Search, mentions, presence ─────────────────────────────────────────────

async function readableChannels(ctx: MemberContext) {
  const { channels } = await listVisibleChannels(ctx, { types: ['text'] });
  return channels.filter((c) => perm(c, Permission.READ_HISTORY));
}

export interface MessageSearchHit {
  message: MessageView;
  channelName: string;
  snippet: string;
}

/** Full-text search across the text channels the viewer can read. Supports from: and in:. */
export async function searchMessages(
  ctx: MemberContext,
  rawQ: string,
  limit = 25,
): Promise<MessageSearchHit[]> {
  const parsed = parseSearchQuery(rawQ.slice(0, 200));
  if (parsed.text.length < 2 && !parsed.from) return [];
  let channels = await readableChannels(ctx);
  if (parsed.in) channels = channels.filter((c) => c.name === parsed.in);
  if (!channels.length) return [];
  const where: (SQL | undefined)[] = [
    eq(schema.messages.communityId, ctx.community.id),
    inArray(
      schema.messages.channelId,
      channels.map((c) => c.id),
    ),
    isNull(schema.messages.deletedAt),
  ];
  const tsq = sql`websearch_to_tsquery('simple', ${parsed.text || ''})`;
  if (parsed.text.length >= 2) where.push(sql`${schema.messages.search} @@ ${tsq}`);
  if (parsed.from) {
    const author = await db.query.users.findFirst({
      where: eq(schema.users.username, parsed.from),
    });
    if (!author) return [];
    where.push(eq(schema.messages.authorId, author.id));
  }
  const rows = await db
    .select({
      row: schema.messages,
      snippet:
        parsed.text.length >= 2
          ? sql<string>`ts_headline('simple', ${schema.messages.content}, ${tsq}, 'MaxFragments=1,MaxWords=30,MinWords=10,StartSel=«,StopSel=»')`
          : sql<string>`left(${schema.messages.content}, 200)`,
    })
    .from(schema.messages)
    .where(and(...where))
    .orderBy(desc(schema.messages.id))
    .limit(Math.min(50, limit));
  const views = await toViews(
    ctx.community.id,
    ctx.userId,
    rows.map((r) => r.row),
  );
  const names = new Map(channels.map((c) => [c.id, c.name]));
  return views.map((m, i) => ({
    message: m,
    channelName: names.get(m.channelId) ?? '',
    snippet: rows[i]!.snippet,
  }));
}

/** Recent messages that mention the viewer, across the channels they can read. */
export async function mentionsInbox(
  ctx: MemberContext,
  limit = 30,
): Promise<{ message: MessageView; channelName: string }[]> {
  if (!ctx.userId || !ctx.isMember) return [];
  const channels = await readableChannels(ctx);
  if (!channels.length) return [];
  const rows = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.communityId, ctx.community.id),
        inArray(
          schema.messages.channelId,
          channels.map((c) => c.id),
        ),
        isNull(schema.messages.deletedAt),
        ne(schema.messages.authorId, ctx.userId),
        or(
          eq(schema.messages.mentionEveryone, true),
          sql`${ctx.userId} = any(${schema.messages.mentionUserIds})`,
          sql`${schema.messages.mentionRoleIds} && ${uuidArray(ctx.roleIds)}`,
        ),
      ),
    )
    .orderBy(desc(schema.messages.id))
    .limit(Math.min(50, limit));
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const views = await toViews(ctx.community.id, ctx.userId, rows);
  return views.map((m) => ({ message: m, channelName: names.get(m.channelId) ?? '' }));
}

/** A section of the member list: a role shown separately, "Online", or "Offline". */
export interface MemberListGroup {
  /** A hoisted role's id, or 'online' / 'offline'. */
  id: string;
  /** The role's name ('' for the Online and Offline sections, which the page names). */
  name: string;
  color: string | null;
  members: (ChatAuthor & { online: boolean })[];
  /** Everyone in the section, when more exist than are listed. */
  total: number;
}

/** How many people each section lists at most. */
const MEMBER_LIST_MAX = 100;

/**
 * The chat's member list, as Discord shows it: people online under their highest role that's
 * shown separately (or "Online"), highest roles first, then some of those offline.
 */
export async function memberList(ctx: MemberContext): Promise<MemberListView> {
  // The same for everyone in the community, and every open chat asks for it now and then.
  return cached(`memberlist:${ctx.community.id}`, 15, () => loadMemberList(ctx.community.id));
}

interface MemberListView {
  groups: MemberListGroup[];
  online: number;
  members: number;
}

async function loadMemberList(communityId: string): Promise<MemberListView> {
  const all = await db
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(eq(schema.members.communityId, communityId))
    .limit(2000);
  if (!all.length) return { groups: [], online: 0, members: 0 };
  const flags = await cacheRedis().mget(...all.map((m) => `presence:${m.userId}`));
  const onlineIds = all.filter((_, i) => flags[i]).map((m) => m.userId);
  const offlineIds = all.filter((_, i) => !flags[i]).map((m) => m.userId);
  const shownOnline = onlineIds.slice(0, MEMBER_LIST_MAX);
  // Offline people are many and rarely looked for: only some, and only for smaller communities.
  const shownOffline = all.length <= 1000 ? offlineIds.slice(0, MEMBER_LIST_MAX) : [];
  const [authors, hoisted] = await Promise.all([
    loadAuthors(communityId, [...shownOnline, ...shownOffline]),
    shownOnline.length
      ? db
          .select({
            userId: schema.memberRoles.userId,
            roleId: schema.roles.id,
            name: schema.roles.name,
            color: schema.roles.color,
            position: schema.roles.position,
          })
          .from(schema.memberRoles)
          .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
          .where(
            and(
              eq(schema.memberRoles.communityId, communityId),
              eq(schema.roles.hoist, true),
              inArray(schema.memberRoles.userId, shownOnline),
            ),
          )
      : [],
  ]);
  // Each online person's highest hoisted role.
  const top = new Map<string, (typeof hoisted)[number]>();
  for (const h of hoisted) {
    const current = top.get(h.userId);
    if (!current || h.position > current.position) top.set(h.userId, h);
  }
  const byName = (a: ChatAuthor, b: ChatAuthor) => displayName(a).localeCompare(displayName(b));
  const sections = new Map<string, MemberListGroup & { position: number }>();
  for (const id of shownOnline) {
    const author = authors.get(id);
    if (!author) continue;
    const role = top.get(id);
    const key = role?.roleId ?? 'online';
    let section = sections.get(key);
    if (!section) {
      section = {
        id: key,
        name: role?.name ?? '',
        color: role?.color ?? null,
        members: [],
        total: 0,
        position: role?.position ?? -1,
      };
      sections.set(key, section);
    }
    section.members.push({ ...author, online: true });
    section.total++;
  }
  const groups: MemberListGroup[] = [...sections.values()]
    .sort((a, b) => b.position - a.position)
    .map(({ position: _position, ...g }) => ({ ...g, members: g.members.sort(byName) }));
  const offline = shownOffline
    .map((id) => authors.get(id))
    .filter((a): a is ChatAuthor => Boolean(a))
    .sort(byName)
    .map((a) => ({ ...a, online: false }));
  if (offline.length) {
    groups.push({
      id: 'offline',
      name: '',
      color: null,
      members: offline,
      total: offlineIds.length,
    });
  }
  return { groups, online: onlineIds.length, members: all.length };
}

// ── Worker: link previews ──────────────────────────────────────────────────

/** Replace a message's embeds (from the preview worker) and tell viewers. */
export async function setMessageEmbeds(messageId: string, embeds: MessageEmbed[]): Promise<void> {
  const [row] = await db
    .update(schema.messages)
    .set({ embeds })
    .where(and(eq(schema.messages.id, messageId), isNull(schema.messages.deletedAt)))
    .returning({ channelId: schema.messages.channelId });
  if (row)
    realtime()
      .to(rooms.chat(row.channelId))
      .emit('message:updated', { channelId: row.channelId, id: messageId, patch: { embeds } });
}
