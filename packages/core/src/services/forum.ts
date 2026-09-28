import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, schema, type Tx } from '@magnox/db';
import {
  docToText,
  flairInputSchema,
  has,
  newId,
  Permission,
  postInputSchema,
  REACTIONS,
  sanitizeDoc,
  threadInputSchema,
  THREAD_SORTS,
  type RichNode,
  type ThreadSort,
  nameStyleView,
  pickRoleDecor,
  themeBackdrops,
  type NameStyleView,
} from '@magnox/shared';
import { z } from 'zod';
import { channelPermissions, requirePerm, type MemberContext } from '../access';
import { AppError, forbidden, notFound, unauthorized } from '../errors';
import { realtime } from '../emitter';
import { enforceRateLimit } from '../ratelimit';
import { rooms } from '../rooms';
import { audit } from './audit';
import { getChannelById, listVisibleChannels, type ChannelView } from './channels';
import { getNotificationSettings, notifyUser, queueFanout } from './notify';
import { mediaUrl } from '../storage';
import { loadAuthors } from './chat';

export interface AuthorView {
  id: string | null;
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

export interface ThreadListItem {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  score: number;
  replyCount: number;
  solved: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  flair: { id: string; name: string; color: string | null } | null;
  author: {
    name: string;
    username: string | null;
    image: string | null;
    nameStyle: NameStyleView | null;
  } | null;
  myVote: number;
  unread: boolean;
  hasPoll: boolean;
}

async function requireChannelPerm(
  ctx: MemberContext,
  channel: ChannelView,
  flag: bigint,
  message?: string,
) {
  if (!ctx.userId) throw unauthorized();
  if (!has(BigInt(channel.perms), flag)) throw forbidden(message);
}

function assertForum(channel: ChannelView) {
  if (channel.type !== 'forum' && channel.type !== 'announcement') {
    throw new AppError('bad_request', 'That channel is not a forum.');
  }
}

// ── Listing ────────────────────────────────────────────────────────────────

export async function listThreads(
  ctx: MemberContext,
  channel: ChannelView,
  opts: { sort?: ThreadSort; flairId?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: ThreadListItem[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(50, opts.pageSize ?? 25);
  const page = Math.max(0, opts.page ?? 0);
  const sort: ThreadSort = THREAD_SORTS.includes(opts.sort as ThreadSort)
    ? (opts.sort as ThreadSort)
    : (channel.settings.defaultSort ?? 'latest');
  const t = schema.threads;
  const where: SQL[] = [eq(t.channelId, channel.id), isNull(t.deletedAt)];
  if (opts.flairId) where.push(eq(t.flairId, opts.flairId));
  if (sort === 'unanswered')
    where.push(channel.settings.qa ? isNull(t.solutionPostId) : eq(t.replyCount, 0));

  const hot = sql`(sign(${t.score} + ${t.replyCount} * 0.5) * log(greatest(abs(${t.score} + ${t.replyCount} * 0.5), 1)) + extract(epoch from ${t.createdAt} - timestamptz '2025-01-01') / 45000)`;
  const order =
    sort === 'new'
      ? [desc(t.createdAt)]
      : sort === 'top'
        ? [desc(t.score), desc(t.createdAt)]
        : sort === 'hot'
          ? [desc(hot)]
          : [desc(t.lastActivityAt)];

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: t.id,
        title: t.title,
        pinned: t.pinned,
        locked: t.locked,
        score: t.score,
        replyCount: t.replyCount,
        solutionPostId: t.solutionPostId,
        lastActivityAt: t.lastActivityAt,
        createdAt: t.createdAt,
        flairId: schema.flairs.id,
        flairName: schema.flairs.name,
        flairColor: schema.flairs.color,
        authorName: schema.users.name,
        authorUsername: schema.users.username,
        authorImage: schema.users.image,
        authorId: t.authorId,
        pollId: schema.polls.id,
      })
      .from(t)
      .leftJoin(schema.flairs, eq(schema.flairs.id, t.flairId))
      .leftJoin(schema.users, eq(schema.users.id, t.authorId))
      .leftJoin(schema.polls, eq(schema.polls.threadId, t.id))
      .where(and(...where))
      .orderBy(desc(t.pinned), ...order)
      .limit(pageSize)
      .offset(page * pageSize),
    db
      .select({ n: count() })
      .from(t)
      .where(and(...where)),
  ]);

  const ids = rows.map((r) => r.id);
  const [votes, reads] =
    ctx.userId && ids.length
      ? await Promise.all([
          db
            .select({ threadId: schema.threadVotes.threadId, value: schema.threadVotes.value })
            .from(schema.threadVotes)
            .where(
              and(
                eq(schema.threadVotes.userId, ctx.userId),
                inArray(schema.threadVotes.threadId, ids),
              ),
            ),
          db
            .select({ threadId: schema.threadReads.threadId, readAt: schema.threadReads.readAt })
            .from(schema.threadReads)
            .where(
              and(
                eq(schema.threadReads.userId, ctx.userId),
                inArray(schema.threadReads.threadId, ids),
              ),
            ),
        ])
      : [[], []];
  const voteBy = new Map(votes.map((v) => [v.threadId, v.value]));
  // Nicknames and nametag styles in this community.
  const authors = await loadAuthors(
    ctx.community.id,
    rows.map((r) => r.authorId).filter((x): x is string => Boolean(x)),
  );
  const readBy = new Map(reads.map((r) => [r.threadId, r.readAt]));

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      pinned: r.pinned,
      locked: r.locked,
      score: r.score,
      replyCount: r.replyCount,
      solved: Boolean(r.solutionPostId),
      lastActivityAt: r.lastActivityAt,
      createdAt: r.createdAt,
      flair: r.flairId ? { id: r.flairId, name: r.flairName!, color: r.flairColor } : null,
      author: r.authorName
        ? {
            name: (r.authorId && authors.get(r.authorId)?.nickname) || r.authorName,
            username: r.authorUsername,
            image: r.authorImage,
            nameStyle: (r.authorId && authors.get(r.authorId)?.nameStyle) || null,
          }
        : null,
      myVote: voteBy.get(r.id) ?? 0,
      unread: Boolean(ctx.userId) && (readBy.get(r.id) ?? new Date(0)) < r.lastActivityAt,
      hasPoll: Boolean(r.pollId),
    })),
    total: totals[0]?.n ?? 0,
    page,
    pageSize,
  };
}

/** Recent threads across every forum the viewer can see (landing-page block). */
export async function recentThreads(
  ctx: MemberContext,
  opts: { channelId?: string; count: number },
) {
  const { channels } = await listVisibleChannels(ctx, { types: ['forum', 'announcement'] });
  const allowed = channels
    .filter((c) => (opts.channelId ? c.id === opts.channelId : true))
    .map((c) => c.id);
  if (!allowed.length) return [];
  return db
    .select({
      id: schema.threads.id,
      title: schema.threads.title,
      replyCount: schema.threads.replyCount,
      lastActivityAt: schema.threads.lastActivityAt,
      channelName: schema.channels.name,
      authorName: schema.users.name,
    })
    .from(schema.threads)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.threads.channelId))
    .leftJoin(schema.users, eq(schema.users.id, schema.threads.authorId))
    .where(and(inArray(schema.threads.channelId, allowed), isNull(schema.threads.deletedAt)))
    .orderBy(desc(schema.threads.lastActivityAt))
    .limit(Math.min(10, opts.count));
}

export type ThreadRow = typeof schema.threads.$inferSelect;

export async function getThread(ctx: MemberContext, threadId: string) {
  const thread = await db.query.threads.findFirst({
    where: and(
      eq(schema.threads.id, threadId),
      eq(schema.threads.communityId, ctx.community.id),
      isNull(schema.threads.deletedAt),
    ),
  });
  if (!thread) throw notFound('Thread');
  const channel = await getChannelById(ctx, thread.channelId);
  const [flair, poll, myVote, following] = await Promise.all([
    thread.flairId
      ? db.query.flairs.findFirst({ where: eq(schema.flairs.id, thread.flairId) })
      : null,
    db.query.polls.findFirst({ where: eq(schema.polls.threadId, thread.id) }),
    ctx.userId
      ? db.query.threadVotes.findFirst({
          where: and(
            eq(schema.threadVotes.threadId, thread.id),
            eq(schema.threadVotes.userId, ctx.userId),
          ),
        })
      : null,
    ctx.userId
      ? db.query.threadFollows.findFirst({
          where: and(
            eq(schema.threadFollows.threadId, thread.id),
            eq(schema.threadFollows.userId, ctx.userId),
          ),
        })
      : null,
  ]);
  return {
    thread,
    channel,
    flair: flair ?? null,
    poll: poll ?? null,
    myVote: myVote?.value ?? 0,
    following: Boolean(following),
  };
}

export interface PostView {
  id: string;
  isOp: boolean;
  body: RichNode | null;
  createdAt: Date;
  editedAt: Date | null;
  deleted: boolean;
  replyToId: string | null;
  author: AuthorView;
  reactions: { emoji: string; count: number; mine: boolean }[];
  blocked: boolean;
}

export async function listPosts(
  ctx: MemberContext,
  threadId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ posts: PostView[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(100, opts.pageSize ?? 30);
  const page = Math.max(0, opts.page ?? 0);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: schema.posts.id,
        isOp: schema.posts.isOp,
        body: schema.posts.body,
        createdAt: schema.posts.createdAt,
        editedAt: schema.posts.editedAt,
        deletedAt: schema.posts.deletedAt,
        replyToId: schema.posts.replyToId,
        authorId: schema.posts.authorId,
        name: schema.users.name,
        username: schema.users.username,
        image: schema.users.image,
      })
      .from(schema.posts)
      .leftJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(eq(schema.posts.threadId, threadId))
      .orderBy(asc(schema.posts.id))
      .limit(pageSize)
      .offset(page * pageSize),
    db.select({ n: count() }).from(schema.posts).where(eq(schema.posts.threadId, threadId)),
  ]);
  const postIds = rows.map((r) => r.id);
  const authorIds = [
    ...new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))),
  ];

  const [reactions, members, topRoles, blocks, [community]] = await Promise.all([
    postIds.length
      ? db
          .select({
            postId: schema.postReactions.postId,
            emoji: schema.postReactions.emoji,
            userId: schema.postReactions.userId,
          })
          .from(schema.postReactions)
          .where(inArray(schema.postReactions.postId, postIds))
      : [],
    authorIds.length
      ? db
          .select({ userId: schema.members.userId, nickname: schema.members.nickname })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.communityId, ctx.community.id),
              inArray(schema.members.userId, authorIds),
            ),
          )
      : [],
    authorIds.length
      ? db
          .select({
            userId: schema.memberRoles.userId,
            name: schema.roles.name,
            color: schema.roles.color,
            position: schema.roles.position,
            iconKey: schema.roles.iconKey,
            nameStyle: schema.roles.nameStyle,
          })
          .from(schema.memberRoles)
          .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
          .where(
            and(
              eq(schema.memberRoles.communityId, ctx.community.id),
              inArray(schema.memberRoles.userId, authorIds),
            ),
          )
      : [],
    ctx.userId && authorIds.length
      ? db
          .select({ blockedId: schema.userBlocks.blockedId })
          .from(schema.userBlocks)
          .where(
            and(
              eq(schema.userBlocks.userId, ctx.userId),
              inArray(schema.userBlocks.blockedId, authorIds),
            ),
          )
      : [],
    db
      .select({ theme: schema.communities.theme })
      .from(schema.communities)
      .where(eq(schema.communities.id, ctx.community.id))
      .limit(1),
  ]);
  const backdrops = community ? themeBackdrops(community.theme) : undefined;
  const nick = new Map(members.map((m) => [m.userId, m.nickname]));
  const topRole = new Map<string, (typeof topRoles)[number]>();
  const rolesByUser = new Map<string, (typeof topRoles)[number][]>();
  for (const r of topRoles) {
    const cur = topRole.get(r.userId);
    if (!cur || r.position > cur.position) topRole.set(r.userId, r);
    rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r]);
  }
  const decorFor = (userId: string | null) => {
    const d = pickRoleDecor(userId ? (rolesByUser.get(userId) ?? []) : [], backdrops);
    return {
      nameStyle: d.nameStyle,
      roleIcon: d.icon ? { url: mediaUrl(d.icon.key)!, roleName: d.icon.roleName } : null,
    };
  };
  const blocked = new Set(blocks.map((b) => b.blockedId));
  const byPost = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of reactions) {
    const m = byPost.get(r.postId) ?? new Map();
    const e = m.get(r.emoji) ?? { count: 0, mine: false };
    e.count++;
    if (r.userId === ctx.userId) e.mine = true;
    m.set(r.emoji, e);
    byPost.set(r.postId, m);
  }

  return {
    posts: rows.map((r) => {
      const role = r.authorId ? topRole.get(r.authorId) : undefined;
      return {
        id: r.id,
        isOp: r.isOp,
        body: r.deletedAt ? null : r.body,
        createdAt: r.createdAt,
        editedAt: r.editedAt,
        deleted: Boolean(r.deletedAt),
        replyToId: r.replyToId,
        author: {
          id: r.authorId,
          name: r.name ?? 'Deleted user',
          username: r.username ?? null,
          image: r.image ?? null,
          nickname: r.authorId ? (nick.get(r.authorId) ?? null) : null,
          roleColor: role?.color ?? null,
          roleName: role?.name ?? null,
          roleStyle: role ? nameStyleView(role.color, role.nameStyle, backdrops) : null,
          ...decorFor(r.authorId),
        },
        reactions: [...(byPost.get(r.id)?.entries() ?? [])]
          .map(([emoji, v]) => ({ emoji, ...v }))
          .sort(
            (a, b) => REACTIONS.indexOf(a.emoji as never) - REACTIONS.indexOf(b.emoji as never),
          ),
        blocked: Boolean(r.authorId && blocked.has(r.authorId)),
      };
    }),
    total: totals[0]?.n ?? 0,
    page,
    pageSize,
  };
}

/** Which page of a thread a post is on, for permalinks and notification links. */
export async function locatePost(
  ctx: MemberContext,
  threadId: string,
  postId: string,
  pageSize = 30,
): Promise<number> {
  await getThread(ctx, threadId);
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.threadId, threadId)),
  });
  if (!post) throw notFound('Post');
  const [row] = await db
    .select({ n: count() })
    .from(schema.posts)
    .where(and(eq(schema.posts.threadId, threadId), lt(schema.posts.id, postId)));
  return Math.floor((row?.n ?? 0) / pageSize);
}

// ── Writing ────────────────────────────────────────────────────────────────

async function autoFollow(tx: Tx, userId: string, threadId: string) {
  const settings = await getNotificationSettings(userId);
  if (!settings.autoFollow) return;
  await tx.insert(schema.threadFollows).values({ threadId, userId }).onConflictDoNothing();
}

async function enforceSlowmode(ctx: MemberContext, channel: ChannelView) {
  if (!channel.slowmodeSeconds || has(BigInt(channel.perms), Permission.MANAGE_MESSAGES)) return;
  await enforceRateLimit(
    `slowmode:${channel.id}:${ctx.userId}`,
    1,
    channel.slowmodeSeconds,
    `Slow mode is on: you can post once every ${channel.slowmodeSeconds} seconds here.`,
  );
}

function prepareBody(raw: unknown): { body: RichNode; text: string } {
  const body = sanitizeDoc(raw);
  const text = docToText(body, 50_000);
  if (!text.trim() && !JSON.stringify(body).includes('"image"')) {
    throw new AppError('validation', 'Write something first.', {
      fields: { body: 'Write something first.' },
    });
  }
  return { body, text };
}

export async function createThread(ctx: MemberContext, raw: unknown): Promise<{ id: string }> {
  const input = threadInputSchema.parse(raw);
  const channel = await getChannelById(ctx, input.channelId);
  assertForum(channel);
  await requireChannelPerm(
    ctx,
    channel,
    Permission.CREATE_THREADS,
    "You can't start threads in this channel.",
  );
  const isMod = has(BigInt(channel.perms), Permission.MANAGE_THREADS);
  if (channel.type === 'announcement' && !isMod)
    throw forbidden('Only moderators can post announcements.');
  await enforceRateLimit(`thread:${ctx.userId}`, 10, 600, 'You are starting threads too quickly.');
  await enforceSlowmode(ctx, channel);

  if (input.flairId) {
    const flair = await db.query.flairs.findFirst({
      where: and(
        eq(schema.flairs.id, input.flairId),
        eq(schema.flairs.communityId, ctx.community.id),
      ),
    });
    if (!flair || (flair.channelId && flair.channelId !== channel.id))
      throw new AppError('validation', 'Choose a valid flair.');
    if (flair.modOnly && !isMod) throw forbidden('That flair is for moderators.');
  } else if (channel.settings.requireFlair) {
    throw new AppError('validation', 'Choose a flair for your thread.', {
      fields: { flairId: 'Required' },
    });
  }
  const { body, text } = prepareBody(input.body);
  const threadId = newId();
  const postId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(schema.threads).values({
      id: threadId,
      communityId: ctx.community.id,
      channelId: channel.id,
      authorId: ctx.userId,
      title: input.title,
      flairId: input.flairId,
      lastPostId: postId,
    });
    await tx.insert(schema.posts).values({
      id: postId,
      threadId,
      communityId: ctx.community.id,
      authorId: ctx.userId,
      isOp: true,
      body,
      bodyText: text,
    });
    if (input.poll) {
      await tx.insert(schema.polls).values({
        id: newId(),
        threadId,
        question: input.poll.question,
        options: input.poll.options.map((label, i) => ({ id: `o${i + 1}`, label })),
        multiple: input.poll.multiple,
        closesAt: input.poll.closesInHours
          ? new Date(Date.now() + input.poll.closesInHours * 3600_000)
          : null,
      });
    }
    await tx
      .update(schema.channels)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.channels.id, channel.id));
    await autoFollow(tx, ctx.userId!, threadId);
  });
  await queueFanout({ kind: 'post', postId });
  realtime().to(rooms.channel(channel.id)).emit('thread:new', { channelId: channel.id, threadId });
  return { id: threadId };
}

async function loadThreadForWrite(ctx: MemberContext, threadId: string) {
  const { thread, channel } = await getThread(ctx, threadId);
  return { thread, channel, isMod: has(BigInt(channel.perms), Permission.MANAGE_THREADS) };
}

export async function createReply(
  ctx: MemberContext,
  threadId: string,
  raw: unknown,
): Promise<{ id: string }> {
  const input = postInputSchema.parse(raw);
  const { thread, channel, isMod } = await loadThreadForWrite(ctx, threadId);
  await requireChannelPerm(
    ctx,
    channel,
    Permission.REPLY_IN_THREADS,
    "You can't reply in this channel.",
  );
  if (thread.locked && !isMod) throw forbidden('This thread is locked.');
  await enforceRateLimit(`reply:${ctx.userId}`, 30, 300, 'You are replying too quickly.');
  await enforceSlowmode(ctx, channel);
  if (input.replyToId) {
    const parent = await db.query.posts.findFirst({
      where: and(eq(schema.posts.id, input.replyToId), eq(schema.posts.threadId, thread.id)),
    });
    if (!parent) throw new AppError('validation', 'The post you replied to no longer exists.');
  }
  const { body, text } = prepareBody(input.body);
  const postId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.posts).values({
      id: postId,
      threadId: thread.id,
      communityId: ctx.community.id,
      authorId: ctx.userId,
      body,
      bodyText: text,
      replyToId: input.replyToId,
    });
    await tx
      .update(schema.threads)
      .set({
        replyCount: sql`${schema.threads.replyCount} + 1`,
        lastActivityAt: new Date(),
        lastPostId: postId,
      })
      .where(eq(schema.threads.id, thread.id));
    await tx
      .update(schema.channels)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.channels.id, channel.id));
    await autoFollow(tx, ctx.userId!, thread.id);
    await tx
      .insert(schema.threadReads)
      .values({
        threadId: thread.id,
        userId: ctx.userId!,
        lastReadPostId: postId,
        readAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.threadReads.threadId, schema.threadReads.userId],
        set: { lastReadPostId: postId, readAt: new Date() },
      });
  });
  await queueFanout({ kind: 'post', postId });
  realtime()
    .to(rooms.thread(thread.id))
    .emit('post:new', { threadId: thread.id, postId, authorId: ctx.userId });
  // Thread lists show reply counts and sort by activity.
  realtime()
    .to(rooms.channel(channel.id))
    .emit('thread:activity', { channelId: channel.id, threadId: thread.id });
  return { id: postId };
}

export async function editPost(
  ctx: MemberContext,
  postId: string,
  raw: unknown,
  opts: { title?: string } = {},
): Promise<void> {
  const post = await db.query.posts.findFirst({
    where: and(
      eq(schema.posts.id, postId),
      eq(schema.posts.communityId, ctx.community.id),
      isNull(schema.posts.deletedAt),
    ),
  });
  if (!post) throw notFound('Post');
  if (!ctx.userId || post.authorId !== ctx.userId)
    throw forbidden('You can only edit your own posts.');
  const { thread } = await loadThreadForWrite(ctx, post.threadId);
  if (thread.locked) throw forbidden('This thread is locked.');
  const input = postInputSchema.pick({ body: true }).parse(raw);
  const { body, text } = prepareBody(input.body);
  const title =
    opts.title !== undefined ? z.string().trim().min(3).max(200).parse(opts.title) : undefined;
  await enforceRateLimit(`edit:${ctx.userId}`, 30, 300);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.postRevisions)
      .values({ id: newId(), postId, editorId: ctx.userId, body: post.body });
    await tx
      .update(schema.posts)
      .set({ body, bodyText: text, editedAt: new Date() })
      .where(eq(schema.posts.id, postId));
    if (post.isOp && title && title !== thread.title) {
      await tx.update(schema.threads).set({ title }).where(eq(schema.threads.id, thread.id));
    }
  });
  realtime().to(rooms.thread(thread.id)).emit('post:edited', { threadId: thread.id, postId });
}

export async function deletePost(
  ctx: MemberContext,
  postId: string,
  reason?: string,
): Promise<{ threadDeleted: boolean }> {
  const post = await db.query.posts.findFirst({
    where: and(
      eq(schema.posts.id, postId),
      eq(schema.posts.communityId, ctx.community.id),
      isNull(schema.posts.deletedAt),
    ),
  });
  if (!post) throw notFound('Post');
  const { thread, channel, isMod } = await loadThreadForWrite(ctx, post.threadId);
  const own = Boolean(ctx.userId && post.authorId === ctx.userId);
  const canModerate = has(BigInt(channel.perms), Permission.MANAGE_MESSAGES) || isMod;
  if (!own && !canModerate) throw forbidden();
  const now = new Date();
  await db.transaction(async (tx) => {
    if (post.isOp) {
      // Removing the opening post removes the whole thread.
      await tx
        .update(schema.threads)
        .set({ deletedAt: now })
        .where(eq(schema.threads.id, thread.id));
    }
    await tx
      .update(schema.posts)
      .set({ deletedAt: now, deletedBy: ctx.userId })
      .where(eq(schema.posts.id, postId));
    if (!post.isOp) {
      await tx
        .update(schema.threads)
        .set({ replyCount: sql`greatest(${schema.threads.replyCount} - 1, 0)` })
        .where(eq(schema.threads.id, thread.id));
      if (thread.solutionPostId === postId) {
        await tx
          .update(schema.threads)
          .set({ solutionPostId: null })
          .where(eq(schema.threads.id, thread.id));
      }
    }
    if (!own) {
      await audit(tx, {
        communityId: ctx.community.id,
        actorId: ctx.userId,
        action: post.isOp ? 'thread.delete' : 'post.delete',
        targetType: post.isOp ? 'thread' : 'post',
        targetId: post.isOp ? thread.id : postId,
        diff: { title: thread.title },
        reason,
      });
    }
  });
  realtime().to(rooms.thread(thread.id)).emit('post:deleted', { threadId: thread.id, postId });
  return { threadDeleted: post.isOp };
}

export async function postHistory(ctx: MemberContext, postId: string) {
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.communityId, ctx.community.id)),
  });
  if (!post) throw notFound('Post');
  await getThread(ctx, post.threadId);
  return db
    .select({
      id: schema.postRevisions.id,
      body: schema.postRevisions.body,
      createdAt: schema.postRevisions.createdAt,
    })
    .from(schema.postRevisions)
    .where(eq(schema.postRevisions.postId, postId))
    .orderBy(desc(schema.postRevisions.id))
    .limit(50);
}

export async function toggleReaction(
  ctx: MemberContext,
  postId: string,
  emoji: string,
): Promise<{ added: boolean }> {
  if (!(REACTIONS as readonly string[]).includes(emoji))
    throw new AppError('validation', 'Unknown reaction.');
  const post = await db.query.posts.findFirst({
    where: and(
      eq(schema.posts.id, postId),
      eq(schema.posts.communityId, ctx.community.id),
      isNull(schema.posts.deletedAt),
    ),
  });
  if (!post) throw notFound('Post');
  const { channel } = await loadThreadForWrite(ctx, post.threadId);
  await requireChannelPerm(ctx, channel, Permission.ADD_REACTIONS, "You can't react here.");
  await enforceRateLimit(`react:${ctx.userId}`, 60, 60);
  const key = and(
    eq(schema.postReactions.postId, postId),
    eq(schema.postReactions.userId, ctx.userId!),
    eq(schema.postReactions.emoji, emoji),
  );
  const existing = await db.query.postReactions.findFirst({ where: key });
  if (existing) await db.delete(schema.postReactions).where(key);
  else await db.insert(schema.postReactions).values({ postId, userId: ctx.userId!, emoji });
  realtime()
    .to(rooms.thread(post.threadId))
    .emit('post:reactions', { threadId: post.threadId, postId });
  return { added: !existing };
}

export async function voteThread(
  ctx: MemberContext,
  threadId: string,
  rawValue: unknown,
): Promise<{ score: number; value: number }> {
  const value = z.union([z.literal(-1), z.literal(0), z.literal(1)]).parse(rawValue);
  const { thread, channel } = await loadThreadForWrite(ctx, threadId);
  if (!channel.settings.voting) throw new AppError('bad_request', 'Voting is off in this channel.');
  await requireChannelPerm(ctx, channel, Permission.VOTE, "You can't vote here.");
  if (thread.authorId === ctx.userId)
    throw new AppError('bad_request', "You can't vote on your own thread.");
  await enforceRateLimit(`vote:${ctx.userId}`, 60, 60);
  const score = await db.transaction(async (tx) => {
    const key = and(
      eq(schema.threadVotes.threadId, threadId),
      eq(schema.threadVotes.userId, ctx.userId!),
    );
    if (value === 0) await tx.delete(schema.threadVotes).where(key);
    else {
      await tx
        .insert(schema.threadVotes)
        .values({ threadId, userId: ctx.userId!, value })
        .onConflictDoUpdate({
          target: [schema.threadVotes.threadId, schema.threadVotes.userId],
          set: { value },
        });
    }
    const [{ s } = { s: 0 }] = await tx
      .select({ s: sql<number>`coalesce(sum(${schema.threadVotes.value}), 0)::int` })
      .from(schema.threadVotes)
      .where(eq(schema.threadVotes.threadId, threadId));
    await tx.update(schema.threads).set({ score: s }).where(eq(schema.threads.id, threadId));
    return s;
  });
  return { score, value };
}

export interface PollResults {
  id: string;
  question: string;
  multiple: boolean;
  closesAt: Date | null;
  closed: boolean;
  totalVoters: number;
  options: { id: string; label: string; votes: number; mine: boolean }[];
}

export async function pollResults(ctx: MemberContext, pollId: string): Promise<PollResults> {
  const poll = await db.query.polls.findFirst({ where: eq(schema.polls.id, pollId) });
  if (!poll) throw notFound('Poll');
  const votes = await db.select().from(schema.pollVotes).where(eq(schema.pollVotes.pollId, pollId));
  return {
    id: poll.id,
    question: poll.question,
    multiple: poll.multiple,
    closesAt: poll.closesAt,
    closed: Boolean(poll.closesAt && poll.closesAt < new Date()),
    totalVoters: new Set(votes.map((v) => v.userId)).size,
    options: poll.options.map((o) => ({
      ...o,
      votes: votes.filter((v) => v.optionId === o.id).length,
      mine: votes.some((v) => v.optionId === o.id && v.userId === ctx.userId),
    })),
  };
}

export async function votePoll(
  ctx: MemberContext,
  pollId: string,
  rawOptions: unknown,
): Promise<PollResults> {
  const optionIds = z.array(z.string().max(8)).max(10).parse(rawOptions);
  const poll = await db.query.polls.findFirst({ where: eq(schema.polls.id, pollId) });
  if (!poll) throw notFound('Poll');
  const { channel } = await loadThreadForWrite(ctx, poll.threadId);
  await requireChannelPerm(ctx, channel, Permission.VOTE, "You can't vote here.");
  if (poll.closesAt && poll.closesAt < new Date())
    throw new AppError('bad_request', 'This poll has closed.');
  const valid = new Set(poll.options.map((o) => o.id));
  const chosen = [...new Set(optionIds)].filter((id) => valid.has(id));
  if (!poll.multiple && chosen.length > 1) throw new AppError('validation', 'Choose one option.');
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.pollVotes)
      .where(and(eq(schema.pollVotes.pollId, pollId), eq(schema.pollVotes.userId, ctx.userId!)));
    if (chosen.length) {
      await tx
        .insert(schema.pollVotes)
        .values(chosen.map((optionId) => ({ pollId, userId: ctx.userId!, optionId })));
    }
  });
  return pollResults(ctx, pollId);
}

// ── Moderation of threads ───────────────────────────────────────────────────

const threadModSchema = z.object({
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
  channelId: z.string().uuid().optional(),
  flairId: z.string().uuid().nullable().optional(),
});

export async function moderateThread(
  ctx: MemberContext,
  threadId: string,
  raw: unknown,
): Promise<void> {
  const input = threadModSchema.parse(raw);
  const { thread, channel, isMod } = await loadThreadForWrite(ctx, threadId);
  const own = thread.authorId === ctx.userId;
  const onlyFlair = Object.keys(input).every((k) => k === 'flairId');
  if (!isMod && !(own && onlyFlair)) throw forbidden();
  const set: Partial<ThreadRow> = {};
  if (input.pinned !== undefined) set.pinned = input.pinned;
  if (input.locked !== undefined) set.locked = input.locked;
  if (input.channelId && input.channelId !== channel.id) {
    const target = await getChannelById(ctx, input.channelId);
    assertForum(target);
    if (!has(BigInt(target.perms), Permission.MANAGE_THREADS))
      throw forbidden('You need Manage threads in the target channel.');
    set.channelId = target.id;
    set.flairId = null;
  }
  if (input.flairId !== undefined) {
    if (input.flairId) {
      const flair = await db.query.flairs.findFirst({
        where: and(
          eq(schema.flairs.id, input.flairId),
          eq(schema.flairs.communityId, ctx.community.id),
        ),
      });
      if (!flair) throw new AppError('validation', 'Choose a valid flair.');
      if (flair.modOnly && !isMod) throw forbidden('That flair is for moderators.');
    }
    set.flairId = input.flairId;
  }
  if (!Object.keys(set).length) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.threads).set(set).where(eq(schema.threads.id, threadId));
    if (isMod && !(own && onlyFlair)) {
      await audit(tx, {
        communityId: ctx.community.id,
        actorId: ctx.userId,
        action: 'thread.moderate',
        targetType: 'thread',
        targetId: threadId,
        diff: set as Record<string, unknown>,
      });
    }
  });
}

export async function markSolution(
  ctx: MemberContext,
  threadId: string,
  postId: string | null,
): Promise<void> {
  const { thread, channel, isMod } = await loadThreadForWrite(ctx, threadId);
  if (!channel.settings.qa) throw new AppError('bad_request', 'This channel is not a Q&A channel.');
  if (thread.authorId !== ctx.userId && !isMod)
    throw forbidden('Only the author or a moderator can pick the answer.');
  let solutionAuthor: string | null = null;
  if (postId) {
    const post = await db.query.posts.findFirst({
      where: and(
        eq(schema.posts.id, postId),
        eq(schema.posts.threadId, threadId),
        isNull(schema.posts.deletedAt),
      ),
    });
    if (!post || post.isOp) throw new AppError('validation', 'Pick a reply as the answer.');
    solutionAuthor = post.authorId;
  }
  await db
    .update(schema.threads)
    .set({ solutionPostId: postId })
    .where(eq(schema.threads.id, threadId));
  if (solutionAuthor && solutionAuthor !== ctx.userId) {
    await notifyUser({
      userId: solutionAuthor,
      type: 'solution',
      communityId: ctx.community.id,
      actorId: ctx.userId,
      targetType: 'post',
      targetId: postId!,
      url: `/c/${ctx.community.slug}/t/${threadId}/p/${postId}`,
      data: {
        title: thread.title,
        excerpt: 'Your reply was marked as the answer.',
        community: ctx.community.name,
      },
    });
  }
}

export async function setFollow(
  ctx: MemberContext,
  threadId: string,
  follow: boolean,
): Promise<void> {
  if (!ctx.userId) throw unauthorized();
  await getThread(ctx, threadId);
  if (follow)
    await db
      .insert(schema.threadFollows)
      .values({ threadId, userId: ctx.userId })
      .onConflictDoNothing();
  else {
    await db
      .delete(schema.threadFollows)
      .where(
        and(
          eq(schema.threadFollows.threadId, threadId),
          eq(schema.threadFollows.userId, ctx.userId),
        ),
      );
  }
}

export async function markThreadRead(
  userId: string,
  threadId: string,
  lastPostId: string | null,
): Promise<void> {
  await db
    .insert(schema.threadReads)
    .values({ threadId, userId, lastReadPostId: lastPostId, readAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.threadReads.threadId, schema.threadReads.userId],
      // Never move the marker backwards (e.g. reading an older tab after a newer one).
      set: {
        lastReadPostId: sql`greatest(${schema.threadReads.lastReadPostId}, excluded.last_read_post_id)`,
        readAt: new Date(),
      },
    });
}

// ── Flairs ─────────────────────────────────────────────────────────────────

export async function listFlairs(communityId: string, channelId?: string) {
  const rows = await db
    .select()
    .from(schema.flairs)
    .where(eq(schema.flairs.communityId, communityId))
    .orderBy(asc(schema.flairs.position), asc(schema.flairs.name));
  return channelId ? rows.filter((f) => !f.channelId || f.channelId === channelId) : rows;
}

export async function createFlair(ctx: MemberContext, raw: unknown) {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const input = flairInputSchema.parse(raw);
  const existing = await listFlairs(ctx.community.id);
  if (existing.length >= 100)
    throw new AppError('forbidden', 'A community can have up to 100 flairs.');
  const [row] = await db
    .insert(schema.flairs)
    .values({ id: newId(), communityId: ctx.community.id, ...input, position: existing.length })
    .returning();
  return row!;
}

export async function updateFlair(ctx: MemberContext, id: string, raw: unknown) {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  const input = flairInputSchema.parse(raw);
  await db
    .update(schema.flairs)
    .set(input)
    .where(and(eq(schema.flairs.id, id), eq(schema.flairs.communityId, ctx.community.id)));
}

export async function deleteFlair(ctx: MemberContext, id: string) {
  requirePerm(ctx, Permission.MANAGE_CHANNELS);
  await db
    .delete(schema.flairs)
    .where(and(eq(schema.flairs.id, id), eq(schema.flairs.communityId, ctx.community.id)));
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchForum(ctx: MemberContext, rawQ: string, limit = 30) {
  const q = rawQ.trim().slice(0, 100);
  if (q.length < 2) return [];
  const { channels } = await listVisibleChannels(ctx, { types: ['forum', 'announcement'] });
  const readable = channels
    .filter((c) => has(BigInt(c.perms), Permission.READ_HISTORY))
    .map((c) => c.id);
  if (!readable.length) return [];
  const tsq = sql`websearch_to_tsquery('simple', ${q})`;
  const rows = await db
    .select({
      threadId: schema.threads.id,
      title: schema.threads.title,
      channelName: schema.channels.name,
      replyCount: schema.threads.replyCount,
      lastActivityAt: schema.threads.lastActivityAt,
      postId: schema.posts.id,
      snippet: sql<string>`ts_headline('simple', ${schema.posts.bodyText}, ${tsq}, 'MaxFragments=1,MaxWords=24,MinWords=8,StartSel=«,StopSel=»')`,
      rank: sql<number>`greatest(ts_rank(${schema.threads.search}, ${tsq}) * 2, ts_rank(${schema.posts.search}, ${tsq}))`,
    })
    .from(schema.posts)
    .innerJoin(schema.threads, eq(schema.threads.id, schema.posts.threadId))
    .innerJoin(schema.channels, eq(schema.channels.id, schema.threads.channelId))
    .where(
      and(
        inArray(schema.threads.channelId, readable),
        isNull(schema.threads.deletedAt),
        isNull(schema.posts.deletedAt),
        or(sql`${schema.threads.search} @@ ${tsq}`, sql`${schema.posts.search} @@ ${tsq}`),
      ),
    )
    .orderBy(
      desc(
        sql`greatest(ts_rank(${schema.threads.search}, ${tsq}) * 2, ts_rank(${schema.posts.search}, ${tsq}))`,
      ),
    )
    .limit(limit * 3);
  // One result per thread, best match first.
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.threadId) ? false : (seen.add(r.threadId), true)))
    .slice(0, limit);
}

/** Channel perms for a thread (used by the realtime server). */
export async function canViewThread(ctx: MemberContext, threadId: string): Promise<boolean> {
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId) });
  if (!thread || thread.communityId !== ctx.community.id || thread.deletedAt) return false;
  const channel = await db.query.channels.findFirst({
    where: eq(schema.channels.id, thread.channelId),
  });
  if (!channel) return false;
  const perms = await channelPermissions(ctx, {
    id: channel.id,
    parentId: channel.parentId,
    communityId: channel.communityId,
    type: channel.type,
  });
  return has(perms, Permission.VIEW_CHANNEL);
}

/** Thread count and most recent thread for each forum channel (forum index page). */
export async function forumChannelStats(channelIds: string[]) {
  const stats = new Map<
    string,
    { threads: number; latest: { id: string; title: string; lastActivityAt: Date } | null }
  >();
  if (!channelIds.length) return stats;
  const counts = await db
    .select({ channelId: schema.threads.channelId, n: count() })
    .from(schema.threads)
    .where(and(inArray(schema.threads.channelId, channelIds), isNull(schema.threads.deletedAt)))
    .groupBy(schema.threads.channelId);
  const latest = await db
    .selectDistinctOn([schema.threads.channelId], {
      channelId: schema.threads.channelId,
      id: schema.threads.id,
      title: schema.threads.title,
      lastActivityAt: schema.threads.lastActivityAt,
    })
    .from(schema.threads)
    .where(and(inArray(schema.threads.channelId, channelIds), isNull(schema.threads.deletedAt)))
    .orderBy(schema.threads.channelId, desc(schema.threads.lastActivityAt));
  for (const id of channelIds) stats.set(id, { threads: 0, latest: null });
  for (const c of counts) stats.get(c.channelId)!.threads = c.n;
  for (const l of latest)
    stats.get(l.channelId)!.latest = { id: l.id, title: l.title, lastActivityAt: l.lastActivityAt };
  return stats;
}
