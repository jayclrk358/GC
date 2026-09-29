import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  BAN_DURATIONS,
  has,
  newId,
  outranks,
  Permission,
  reportInputSchema,
  TIMEOUT_DURATIONS,
} from '@magnox/shared';
import { z } from 'zod';
import { requireMember, requirePerm, type MemberContext } from '../access';
import { AppError, conflict, forbidden, notFound } from '../errors';
import { realtime } from '../emitter';
import { enforceRateLimit } from '../ratelimit';
import { rooms } from '../rooms';
import { audit } from './audit';
import { getChatChannel } from './chat';
import { queueMediaCleanup } from './media-cleanup';
import { removeMember } from './members';
import { notifyUser, queueFanout } from './notify';

async function targetRank(communityId: string, userId: string, ownerId: string) {
  const rows = await db
    .select({ position: schema.roles.position })
    .from(schema.memberRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
    .where(
      and(eq(schema.memberRoles.communityId, communityId), eq(schema.memberRoles.userId, userId)),
    );
  return { isOwner: userId === ownerId, topPosition: Math.max(0, ...rows.map((r) => r.position)) };
}

async function assertCanModerate(ctx: MemberContext, userId: string) {
  if (userId === ctx.userId) throw new AppError('bad_request', "You can't do that to yourself.");
  const target = await targetRank(ctx.community.id, userId, ctx.community.ownerId);
  if (!outranks({ isOwner: ctx.isOwner, topPosition: ctx.topPosition }, target)) {
    throw forbidden('You can only moderate members below your highest role.');
  }
}

const reasonSchema = z.string().trim().max(500).default('');

export async function kickMember(
  ctx: MemberContext,
  userId: string,
  rawReason: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.KICK_MEMBERS);
  await assertCanModerate(ctx, userId);
  const reason = reasonSchema.parse(rawReason);
  await db.transaction(async (tx) => {
    const removed = await removeMember(tx, ctx.community.id, userId);
    if (!removed) throw notFound('Member');
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'member.kick',
      targetType: 'user',
      targetId: userId,
      reason,
    });
  });
  realtime().to(rooms.user(userId)).emit('community:removed', { communityId: ctx.community.id });
  await notifyUser({
    userId,
    type: 'moderation',
    communityId: ctx.community.id,
    actorId: null,
    url: `/c/${ctx.community.slug}`,
    data: {
      title: `You were removed from ${ctx.community.name}`,
      excerpt: reason,
      community: ctx.community.name,
    },
  });
}

const banSchema = z.object({
  reason: reasonSchema,
  duration: z
    .enum(
      Object.keys(BAN_DURATIONS) as [keyof typeof BAN_DURATIONS, ...(keyof typeof BAN_DURATIONS)[]],
    )
    .default('permanent'),
  /** Remove the member's posts from this far back. */
  deleteSeconds: z
    .number()
    .int()
    .min(0)
    .max(7 * 86400)
    .default(0),
});

export async function banMember(ctx: MemberContext, userId: string, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.BAN_MEMBERS);
  await assertCanModerate(ctx, userId);
  const input = banSchema.parse(raw);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw notFound('User');
  const seconds = BAN_DURATIONS[input.duration];
  const expiresAt = seconds ? new Date(Date.now() + seconds * 1000) : null;
  const removed = { posts: [] as string[], threads: [] as string[] };
  await db.transaction(async (tx) => {
    await removeMember(tx, ctx.community.id, userId);
    await tx
      .insert(schema.bans)
      .values({
        communityId: ctx.community.id,
        userId,
        reason: input.reason,
        bannedBy: ctx.userId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.bans.communityId, schema.bans.userId],
        set: { reason: input.reason, bannedBy: ctx.userId, expiresAt, createdAt: new Date() },
      });
    if (input.deleteSeconds) {
      const since = new Date(Date.now() - input.deleteSeconds * 1000);
      const posts = await tx
        .update(schema.posts)
        .set({ deletedAt: new Date(), deletedBy: ctx.userId })
        .where(
          and(
            eq(schema.posts.communityId, ctx.community.id),
            eq(schema.posts.authorId, userId),
            gt(schema.posts.createdAt, since),
            isNull(schema.posts.deletedAt),
          ),
        )
        .returning({ id: schema.posts.id });
      const threads = await tx
        .update(schema.threads)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(schema.threads.communityId, ctx.community.id),
            eq(schema.threads.authorId, userId),
            gt(schema.threads.createdAt, since),
            isNull(schema.threads.deletedAt),
          ),
        )
        .returning({ id: schema.threads.id });
      removed.posts = posts.map((p) => p.id);
      removed.threads = threads.map((t) => t.id);
    }
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'member.ban',
      targetType: 'user',
      targetId: userId,
      reason: input.reason,
      diff: { duration: input.duration, deleteSeconds: input.deleteSeconds },
    });
  });
  realtime().to(rooms.user(userId)).emit('community:removed', { communityId: ctx.community.id });
  if (removed.posts.length) await queueMediaCleanup({ kind: 'posts', ids: removed.posts });
  if (removed.threads.length) await queueMediaCleanup({ kind: 'threads', ids: removed.threads });
  await notifyUser({
    userId,
    type: 'moderation',
    communityId: ctx.community.id,
    actorId: null,
    url: '/notifications',
    data: {
      title: `You were banned from ${ctx.community.name}${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ''}`,
      excerpt: input.reason,
      community: ctx.community.name,
    },
  });
}

export async function unbanMember(ctx: MemberContext, userId: string): Promise<void> {
  requirePerm(ctx, Permission.BAN_MEMBERS);
  const deleted = await db
    .delete(schema.bans)
    .where(and(eq(schema.bans.communityId, ctx.community.id), eq(schema.bans.userId, userId)))
    .returning({ userId: schema.bans.userId });
  if (!deleted.length) throw notFound('Ban');
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'member.unban',
    targetType: 'user',
    targetId: userId,
  });
}

export async function listBans(ctx: MemberContext) {
  requirePerm(ctx, Permission.BAN_MEMBERS);
  const moderator = sql<string>`(select name from users where id = ${schema.bans.bannedBy})`;
  return db
    .select({
      userId: schema.bans.userId,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      reason: schema.bans.reason,
      expiresAt: schema.bans.expiresAt,
      createdAt: schema.bans.createdAt,
      moderator,
    })
    .from(schema.bans)
    .innerJoin(schema.users, eq(schema.users.id, schema.bans.userId))
    .where(eq(schema.bans.communityId, ctx.community.id))
    .orderBy(desc(schema.bans.createdAt))
    .limit(500);
}

const timeoutSchema = z.object({
  reason: reasonSchema,
  duration: z
    .enum(
      Object.keys(TIMEOUT_DURATIONS) as [
        keyof typeof TIMEOUT_DURATIONS,
        ...(keyof typeof TIMEOUT_DURATIONS)[],
      ],
    )
    .nullable(),
});

/** Set or clear (duration null) a timeout. Timed-out members can read but not post. */
export async function timeoutMember(
  ctx: MemberContext,
  userId: string,
  raw: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.TIMEOUT_MEMBERS);
  await assertCanModerate(ctx, userId);
  const input = timeoutSchema.parse(raw);
  const until = input.duration
    ? new Date(Date.now() + TIMEOUT_DURATIONS[input.duration] * 1000)
    : null;
  const updated = await db
    .update(schema.members)
    .set({ timeoutUntil: until })
    .where(and(eq(schema.members.communityId, ctx.community.id), eq(schema.members.userId, userId)))
    .returning({ userId: schema.members.userId });
  if (!updated.length) throw notFound('Member');
  await db
    .update(schema.communities)
    .set({ permVersion: sql`${schema.communities.permVersion} + 1` })
    .where(eq(schema.communities.id, ctx.community.id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: until ? 'member.timeout' : 'member.timeout.clear',
    targetType: 'user',
    targetId: userId,
    reason: input.reason,
    diff: { until: until?.toISOString() ?? null },
  });
  if (until) {
    await notifyUser({
      userId,
      type: 'moderation',
      communityId: ctx.community.id,
      actorId: null,
      url: `/c/${ctx.community.slug}`,
      data: {
        title: `You're timed out in ${ctx.community.name} until ${until.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        excerpt: input.reason,
        community: ctx.community.name,
      },
    });
  }
}

// ── Reports ────────────────────────────────────────────────────────────────

async function resolveReportTarget(ctx: MemberContext, targetType: string, targetId: string) {
  switch (targetType) {
    case 'post': {
      const post = await db.query.posts.findFirst({
        where: and(
          eq(schema.posts.id, targetId),
          eq(schema.posts.communityId, ctx.community.id),
          isNull(schema.posts.deletedAt),
        ),
      });
      if (!post) throw notFound('Post');
      return { userId: post.authorId, excerpt: post.bodyText.slice(0, 500) };
    }
    case 'thread': {
      const thread = await db.query.threads.findFirst({
        where: and(
          eq(schema.threads.id, targetId),
          eq(schema.threads.communityId, ctx.community.id),
          isNull(schema.threads.deletedAt),
        ),
      });
      if (!thread) throw notFound('Thread');
      return { userId: thread.authorId, excerpt: thread.title };
    }
    case 'wiki_page': {
      const page = await db.query.wikiPages.findFirst({
        where: and(
          eq(schema.wikiPages.id, targetId),
          eq(schema.wikiPages.communityId, ctx.community.id),
        ),
      });
      if (!page) throw notFound('Page');
      return { userId: page.updatedBy, excerpt: `${page.title}: ${page.bodyText.slice(0, 400)}` };
    }
    case 'message': {
      const msg = await db.query.messages.findFirst({
        where: and(
          eq(schema.messages.id, targetId),
          eq(schema.messages.communityId, ctx.community.id),
          isNull(schema.messages.deletedAt),
        ),
      });
      if (!msg) throw notFound('Message');
      // Reporters must be able to see what they report.
      await getChatChannel(ctx, msg.channelId);
      return { userId: msg.authorId, excerpt: msg.content.slice(0, 500) };
    }
    case 'user': {
      const member = await db.query.members.findFirst({
        where: and(
          eq(schema.members.communityId, ctx.community.id),
          eq(schema.members.userId, targetId),
        ),
      });
      if (!member) throw notFound('Member');
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, targetId) });
      return { userId: targetId, excerpt: user?.name ?? '' };
    }
    default:
      throw new AppError('validation', 'Unknown report target.');
  }
}

export async function createReport(ctx: MemberContext, raw: unknown): Promise<{ id: string }> {
  requireMember(ctx);
  const input = reportInputSchema.parse(raw);
  await enforceRateLimit(
    `report:${ctx.userId}`,
    20,
    3600,
    'You have sent a lot of reports. Please wait a while.',
  );
  const target = await resolveReportTarget(ctx, input.targetType, input.targetId);
  if (target.userId === ctx.userId)
    throw new AppError('bad_request', "You can't report your own content.");
  const existing = await db.query.reports.findFirst({
    where: and(
      eq(schema.reports.communityId, ctx.community.id),
      eq(schema.reports.reporterId, ctx.userId!),
      eq(schema.reports.targetType, input.targetType),
      eq(schema.reports.targetId, input.targetId),
      eq(schema.reports.status, 'open'),
    ),
  });
  if (existing) throw conflict('You already reported this. Moderators will review it.');
  const id = newId();
  await db.insert(schema.reports).values({
    id,
    communityId: ctx.community.id,
    reporterId: ctx.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetUserId: target.userId,
    reason: input.reason,
    details: input.details,
    excerpt: target.excerpt,
  });
  await queueFanout({ kind: 'report', reportId: id });
  return { id };
}

export async function listReports(
  ctx: MemberContext,
  status: 'open' | 'resolved' | 'dismissed' = 'open',
) {
  requirePerm(ctx, Permission.MANAGE_REPORTS);
  const reporter = sql<string>`(select name from users where id = ${schema.reports.reporterId})`;
  const targetUser = sql<string>`(select name from users where id = ${schema.reports.targetUserId})`;
  const resolver = sql<string>`(select name from users where id = ${schema.reports.resolvedBy})`;
  const rows = await db
    .select({
      id: schema.reports.id,
      targetType: schema.reports.targetType,
      targetId: schema.reports.targetId,
      targetUserId: schema.reports.targetUserId,
      reason: schema.reports.reason,
      details: schema.reports.details,
      excerpt: schema.reports.excerpt,
      status: schema.reports.status,
      resolution: schema.reports.resolution,
      createdAt: schema.reports.createdAt,
      resolvedAt: schema.reports.resolvedAt,
      reporter,
      targetUser,
      resolver,
    })
    .from(schema.reports)
    .where(and(eq(schema.reports.communityId, ctx.community.id), eq(schema.reports.status, status)))
    .orderBy(desc(schema.reports.id))
    .limit(200);
  // Link posts to their thread for context.
  const postIds = rows.filter((r) => r.targetType === 'post').map((r) => r.targetId);
  const threadOf = new Map<string, string>();
  if (postIds.length) {
    const posts = await db
      .select({ id: schema.posts.id, threadId: schema.posts.threadId })
      .from(schema.posts)
      .where(inArray(schema.posts.id, postIds));
    for (const p of posts) threadOf.set(p.id, p.threadId);
  }
  return rows.map((r) => ({
    ...r,
    threadId: r.targetType === 'thread' ? r.targetId : (threadOf.get(r.targetId) ?? null),
  }));
}

export async function openReportCount(ctx: MemberContext): Promise<number> {
  if (!has(ctx.base, Permission.MANAGE_REPORTS)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reports)
    .where(
      and(eq(schema.reports.communityId, ctx.community.id), eq(schema.reports.status, 'open')),
    );
  return row?.n ?? 0;
}

const resolveSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolution: z.string().trim().max(500).default(''),
});

export async function resolveReport(
  ctx: MemberContext,
  reportId: string,
  raw: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_REPORTS);
  const input = resolveSchema.parse(raw);
  const updated = await db
    .update(schema.reports)
    .set({
      status: input.status,
      resolution: input.resolution,
      resolvedBy: ctx.userId,
      resolvedAt: new Date(),
    })
    .where(and(eq(schema.reports.id, reportId), eq(schema.reports.communityId, ctx.community.id)))
    .returning({ id: schema.reports.id });
  if (!updated.length) throw notFound('Report');
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: `report.${input.status}`,
    targetType: 'report',
    targetId: reportId,
    reason: input.resolution,
  });
}
