import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema, type NotificationType } from '@magnox/db';
import {
  applyTimeout,
  collectMentions,
  computeBasePermissions,
  computeChannelPermissions,
  has,
  newId,
  Permission,
  type Overwrite,
  type RichNode,
} from '@magnox/shared';
import { z } from 'zod';
import { channelPermissions, getMemberContext } from '../access';
import { renderEmail, sendMail } from '../mail';
import { env } from '../env';
import { logger } from '../logger';
import { QUEUES, enqueue } from '../queues';
import { rateLimit } from '../ratelimit';
import { realtime } from '../emitter';
import { cacheRedis } from '../redis';
import { rooms } from '../rooms';

const log = logger('notify');

export type FanoutJob =
  | { kind: 'post'; postId: string }
  | { kind: 'message'; messageId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'wiki_edit'; pageId: string; revisionId: string };

/** Queue notification fan-out; the worker does the heavy lifting. */
export async function queueFanout(job: FanoutJob): Promise<void> {
  const id =
    job.kind === 'post'
      ? job.postId
      : job.kind === 'message'
        ? job.messageId
        : job.kind === 'report'
          ? job.reportId
          : job.revisionId;
  await enqueue(QUEUES.notify, 'fanout', job, {
    jobId: `fanout-${job.kind}-${id}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  communityId: string | null;
  actorId: string | null;
  targetType?: string;
  targetId?: string;
  url: string;
  data: { title?: string; excerpt?: string; community?: string };
}

/** Insert notifications and push them to connected clients. */
export async function deliver(items: NotificationInput[]): Promise<void> {
  if (!items.length) return;
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500).map((n) => ({
      id: newId(),
      ...n,
      targetType: n.targetType ?? null,
      targetId: n.targetId ?? null,
    }));
    await db.insert(schema.notifications).values(batch);
    for (const n of batch) {
      realtime()
        .to(rooms.user(n.userId))
        .emit('notification:new', { id: n.id, type: n.type, url: n.url, data: n.data });
    }
  }
}

export async function notifyUser(n: NotificationInput): Promise<void> {
  await deliver([n]);
}

/**
 * Which of `userIds` can view a channel. Computes permissions in memory from roles, member
 * roles and overwrites so large fan-outs don't need a query per recipient.
 */
export async function usersWhoCanView(
  communityId: string,
  channel: { id: string; parentId: string | null },
  userIds: string[],
): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const [community, roles, members, memberRoles, overwrites] = await Promise.all([
    db.query.communities.findFirst({ where: eq(schema.communities.id, communityId) }),
    db.select().from(schema.roles).where(eq(schema.roles.communityId, communityId)),
    db
      .select({ userId: schema.members.userId, timeoutUntil: schema.members.timeoutUntil })
      .from(schema.members)
      .where(
        and(eq(schema.members.communityId, communityId), inArray(schema.members.userId, userIds)),
      ),
    db
      .select({ userId: schema.memberRoles.userId, roleId: schema.memberRoles.roleId })
      .from(schema.memberRoles)
      .where(
        and(
          eq(schema.memberRoles.communityId, communityId),
          inArray(schema.memberRoles.userId, userIds),
        ),
      ),
    db
      .select()
      .from(schema.permissionOverwrites)
      .where(
        inArray(
          schema.permissionOverwrites.channelId,
          channel.parentId ? [channel.parentId, channel.id] : [channel.id],
        ),
      ),
  ]);
  if (!community) return new Set();
  const everyone = roles.find((r) => r.isDefault);
  if (!everyone) return new Set();
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const rolesByUser = new Map<string, string[]>();
  for (const mr of memberRoles)
    rolesByUser.set(mr.userId, [...(rolesByUser.get(mr.userId) ?? []), mr.roleId]);
  const layer = (channelId: string): Overwrite[] =>
    overwrites
      .filter((o) => o.channelId === channelId)
      .map((o) => ({
        targetType: o.targetType,
        targetId: o.targetId,
        allow: o.allow,
        deny: o.deny,
      }));
  const layers = channel.parentId
    ? [layer(channel.parentId), layer(channel.id)]
    : [layer(channel.id)];
  const out = new Set<string>();
  const now = new Date();
  for (const m of members) {
    const roleIds = rolesByUser.get(m.userId) ?? [];
    const timedOut = Boolean(m.timeoutUntil && m.timeoutUntil > now);
    const base = applyTimeout(
      computeBasePermissions({
        isOwner: community.ownerId === m.userId,
        everyone: everyone.permissions,
        roles: roleIds.map((id) => roleById.get(id)?.permissions ?? 0n),
      }),
      timedOut,
    );
    const perms = computeChannelPermissions({
      base,
      everyoneRoleId: everyone.id,
      memberRoleIds: roleIds,
      userId: m.userId,
      layers,
      timedOut,
    });
    if (has(perms, Permission.VIEW_CHANNEL)) out.add(m.userId);
  }
  // The owner can always see everything.
  if (userIds.includes(community.ownerId)) out.add(community.ownerId);
  return out;
}

async function blockedBy(recipients: string[], actorId: string): Promise<Set<string>> {
  if (!recipients.length) return new Set();
  const rows = await db
    .select({ userId: schema.userBlocks.userId })
    .from(schema.userBlocks)
    .where(
      and(eq(schema.userBlocks.blockedId, actorId), inArray(schema.userBlocks.userId, recipients)),
    );
  return new Set(rows.map((r) => r.userId));
}

async function mutedFor(
  recipients: string[],
  targets: { type: 'community' | 'channel' | 'thread'; id: string }[],
): Promise<Set<string>> {
  if (!recipients.length) return new Set();
  const rows = await db
    .select({ userId: schema.mutes.userId })
    .from(schema.mutes)
    .where(
      and(
        inArray(schema.mutes.userId, recipients),
        or(
          ...targets.map((t) =>
            and(eq(schema.mutes.targetType, t.type), eq(schema.mutes.targetId, t.id)),
          ),
        )!,
        or(isNull(schema.mutes.until), gt(schema.mutes.until, new Date()))!,
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

function excerpt(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Resolve mentions in a post into user ids, honouring the author's permissions. */
export async function resolveMentions(
  communityId: string,
  doc: RichNode,
  canMentionEveryone: boolean,
): Promise<{ users: string[]; roleUsers: string[]; everyone: boolean }> {
  const mentions = collectMentions(doc);
  const userIds = [...new Set(mentions.filter((m) => m.kind === 'user').map((m) => m.id))].slice(
    0,
    50,
  );
  const roleIds = [...new Set(mentions.filter((m) => m.kind === 'role').map((m) => m.id))].slice(
    0,
    10,
  );
  const everyone = canMentionEveryone && mentions.some((m) => m.kind === 'everyone');

  const users = userIds.length
    ? (
        await db
          .select({ userId: schema.members.userId })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.communityId, communityId),
              inArray(schema.members.userId, userIds),
            ),
          )
      ).map((r) => r.userId)
    : [];

  let roleUsers: string[] = [];
  if (roleIds.length) {
    const roles = await db
      .select({ id: schema.roles.id, mentionable: schema.roles.mentionable })
      .from(schema.roles)
      .where(and(eq(schema.roles.communityId, communityId), inArray(schema.roles.id, roleIds)));
    const allowed = roles.filter((r) => r.mentionable || canMentionEveryone).map((r) => r.id);
    if (allowed.length) {
      roleUsers = (
        await db
          .selectDistinct({ userId: schema.memberRoles.userId })
          .from(schema.memberRoles)
          .where(
            and(
              eq(schema.memberRoles.communityId, communityId),
              inArray(schema.memberRoles.roleId, allowed),
            ),
          )
      ).map((r) => r.userId);
    }
  }
  return { users, roleUsers, everyone };
}

async function maybeEmail(
  userId: string,
  type: NotificationType,
  subject: string,
  body: string,
  url: string,
  key: string,
) {
  const settings = await db.query.notificationSettings.findFirst({
    where: eq(schema.notificationSettings.userId, userId),
  });
  const wants =
    type === 'mention'
      ? (settings?.emailMentions ?? true)
      : type === 'reply' || type === 'thread_reply'
        ? (settings?.emailReplies ?? false)
        : type === 'moderation'
          ? (settings?.emailModeration ?? true)
          : false;
  if (!wants) return;
  // Don't email people who are online right now; they'll see it in the app.
  if (await cacheRedis().get(`presence:${userId}`)) return;
  const limited = await rateLimit(`email:${userId}:${key}`, 1, 15 * 60);
  if (!limited.ok) return;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user?.email || user.banned) return;
  const link = `${env().APP_URL}${url}`;
  const { text, html } = renderEmail({
    heading: subject,
    body,
    action: { label: 'Open in Magnox', url: link },
  });
  await sendMail({ to: user.email, subject, text, html });
}

async function fanoutPost(postId: string): Promise<void> {
  const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
  if (!post || post.deletedAt || !post.authorId) return;
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, post.threadId) });
  if (!thread || thread.deletedAt) return;
  const [channel, community, author] = await Promise.all([
    db.query.channels.findFirst({ where: eq(schema.channels.id, thread.channelId) }),
    db.query.communities.findFirst({ where: eq(schema.communities.id, thread.communityId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, post.authorId) }),
  ]);
  if (!channel || !community || !author) return;

  // Can the author mention @everyone / non-mentionable roles in this channel?
  const authorCanEveryone = await canMentionEveryoneIn(community.id, channel, post.authorId);
  const mentions = await resolveMentions(community.id, post.body, authorCanEveryone);

  const type = new Map<string, NotificationType>();
  const set = (id: string, t: NotificationType) => {
    const rank: Record<string, number> = { mention: 3, reply: 2, thread_reply: 1 };
    if ((rank[t] ?? 0) > (rank[type.get(id) ?? ''] ?? 0)) type.set(id, t);
  };
  const direct = new Set<string>();
  for (const id of mentions.users) {
    set(id, 'mention');
    direct.add(id);
  }
  for (const id of mentions.roleUsers) set(id, 'mention');
  if (mentions.everyone) {
    const all = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.communityId, community.id));
    for (const m of all) set(m.userId, 'mention');
  }
  if (!post.isOp) {
    if (post.replyToId) {
      const parent = await db.query.posts.findFirst({ where: eq(schema.posts.id, post.replyToId) });
      if (parent?.authorId) {
        set(parent.authorId, 'reply');
        direct.add(parent.authorId);
      }
    }
    const followers = await db
      .select({ userId: schema.threadFollows.userId })
      .from(schema.threadFollows)
      .where(eq(schema.threadFollows.threadId, thread.id));
    for (const f of followers) set(f.userId, 'thread_reply');
  }
  type.delete(post.authorId);
  let recipients = [...type.keys()];
  if (!recipients.length) return;

  const [blocked, muted, canView] = await Promise.all([
    blockedBy(recipients, post.authorId),
    mutedFor(recipients, [
      { type: 'community', id: community.id },
      { type: 'channel', id: channel.id },
      { type: 'thread', id: thread.id },
    ]),
    usersWhoCanView(community.id, channel, recipients),
  ]);
  recipients = recipients.filter(
    (id) => canView.has(id) && !blocked.has(id) && (direct.has(id) || !muted.has(id)),
  );

  const url = `/c/${community.slug}/t/${thread.id}${post.isOp ? '' : `/p/${post.id}`}`;
  const data = { title: thread.title, excerpt: excerpt(post.bodyText), community: community.name };
  await deliver(
    recipients.map((userId) => ({
      userId,
      type: type.get(userId)!,
      communityId: community.id,
      actorId: post.authorId,
      targetType: 'post',
      targetId: post.id,
      url,
      data,
    })),
  );
  for (const userId of recipients.slice(0, 200)) {
    const t = type.get(userId)!;
    const subject =
      t === 'mention'
        ? `${author.name} mentioned you in “${thread.title}”`
        : t === 'reply'
          ? `${author.name} replied to you in “${thread.title}”`
          : `New reply in “${thread.title}”`;
    await maybeEmail(userId, t, subject, data.excerpt, url, thread.id).catch((err) =>
      log.warn({ err, userId }, 'email failed'),
    );
  }
}

async function canMentionEveryoneIn(
  communityId: string,
  channel: { id: string; parentId: string | null },
  userId: string,
): Promise<boolean> {
  try {
    const ctx = await getMemberContext({ id: communityId }, userId);
    const perms = await channelPermissions(ctx, {
      id: channel.id,
      parentId: channel.parentId,
      communityId,
      type: 'forum',
    });
    return has(perms, Permission.MENTION_EVERYONE);
  } catch {
    return false;
  }
}

async function fanoutReport(reportId: string): Promise<void> {
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, reportId) });
  if (!report) return;
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, report.communityId),
  });
  if (!community) return;
  const roles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.communityId, community.id));
  const modRoles = roles
    .filter(
      (r) =>
        has(r.permissions, Permission.MANAGE_REPORTS) ||
        has(r.permissions, Permission.ADMINISTRATOR),
    )
    .map((r) => r.id);
  const mods = new Set<string>([community.ownerId]);
  if (modRoles.length) {
    const rows = await db
      .selectDistinct({ userId: schema.memberRoles.userId })
      .from(schema.memberRoles)
      .where(
        and(
          eq(schema.memberRoles.communityId, community.id),
          inArray(schema.memberRoles.roleId, modRoles),
        ),
      );
    for (const r of rows) mods.add(r.userId);
  }
  if (report.reporterId) mods.delete(report.reporterId);
  await deliver(
    [...mods].slice(0, 100).map((userId) => ({
      userId,
      type: 'report' as const,
      communityId: community.id,
      actorId: null,
      targetType: 'report',
      targetId: report.id,
      url: `/c/${community.slug}/settings/reports`,
      data: {
        title: `New report: ${report.reason}`,
        excerpt: excerpt(report.excerpt),
        community: community.name,
      },
    })),
  );
}

async function fanoutWikiEdit(pageId: string, revisionId: string): Promise<void> {
  const [page, revision] = await Promise.all([
    db.query.wikiPages.findFirst({ where: eq(schema.wikiPages.id, pageId) }),
    db.query.wikiRevisions.findFirst({ where: eq(schema.wikiRevisions.id, revisionId) }),
  ]);
  if (!page || !revision || !page.createdBy || page.createdBy === revision.authorId) return;
  const community = await db.query.communities.findFirst({
    where: eq(schema.communities.id, page.communityId),
  });
  if (!community) return;
  const muted = await mutedFor([page.createdBy], [{ type: 'community', id: community.id }]);
  if (muted.size) return;
  await notifyUser({
    userId: page.createdBy,
    type: 'wiki_edit',
    communityId: community.id,
    actorId: revision.authorId,
    targetType: 'wiki_page',
    targetId: page.id,
    url: `/c/${community.slug}/wiki/${page.slug}/history/${revision.id}`,
    data: {
      title: page.title,
      excerpt: revision.summary || 'Page edited',
      community: community.name,
    },
  });
}

/** Entry point for the worker's `fanout` jobs. */
/** Mentions and reply pings in chat. Direct mentions and replies ignore mutes. */
async function fanoutMessage(messageId: string): Promise<void> {
  const msg = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!msg || msg.deletedAt || !msg.authorId) return;
  const [channel, community, author, parent] = await Promise.all([
    db.query.channels.findFirst({ where: eq(schema.channels.id, msg.channelId) }),
    db.query.communities.findFirst({ where: eq(schema.communities.id, msg.communityId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, msg.authorId) }),
    msg.replyToId
      ? db.query.messages.findFirst({ where: eq(schema.messages.id, msg.replyToId) })
      : null,
  ]);
  if (!channel || !community || !author) return;
  const inBody = new Set(
    collectMentions(msg.body)
      .filter((m) => m.kind === 'user')
      .map((m) => m.id),
  );
  const type = new Map<string, NotificationType>();
  const direct = new Set<string>();
  for (const id of msg.mentionUserIds) {
    type.set(id, id === parent?.authorId && !inBody.has(id) ? 'reply' : 'mention');
    direct.add(id);
  }
  if (msg.mentionRoleIds.length) {
    const rows = await db
      .selectDistinct({ userId: schema.memberRoles.userId })
      .from(schema.memberRoles)
      .where(
        and(
          eq(schema.memberRoles.communityId, community.id),
          inArray(schema.memberRoles.roleId, msg.mentionRoleIds),
        ),
      );
    for (const r of rows) if (!type.has(r.userId)) type.set(r.userId, 'mention');
  }
  if (msg.mentionEveryone) {
    const all = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.communityId, community.id))
      .limit(5000);
    for (const m of all) if (!type.has(m.userId)) type.set(m.userId, 'mention');
  }
  type.delete(msg.authorId);
  let recipients = [...type.keys()];
  if (!recipients.length) return;
  const [blocked, muted, canView] = await Promise.all([
    blockedBy(recipients, msg.authorId),
    mutedFor(recipients, [
      { type: 'community', id: community.id },
      { type: 'channel', id: channel.id },
    ]),
    usersWhoCanView(community.id, channel, recipients),
  ]);
  recipients = recipients.filter(
    (id) => canView.has(id) && !blocked.has(id) && (direct.has(id) || !muted.has(id)),
  );
  const url = `/c/${community.slug}/m/${msg.id}`;
  const data = {
    title: `#${channel.name}`,
    excerpt: excerpt(msg.content),
    community: community.name,
  };
  await deliver(
    recipients.map((userId) => ({
      userId,
      type: type.get(userId)!,
      communityId: community.id,
      actorId: msg.authorId,
      targetType: 'message',
      targetId: msg.id,
      url,
      data,
    })),
  );
  for (const userId of recipients.filter((id) => direct.has(id)).slice(0, 200)) {
    const t = type.get(userId)!;
    const subject =
      t === 'reply'
        ? `${author.name} replied to you in #${channel.name}`
        : `${author.name} mentioned you in #${channel.name}`;
    await maybeEmail(
      userId,
      t,
      subject,
      excerpt(msg.content, 400),
      url,
      `message:${channel.id}`,
    ).catch((err) => log.warn({ err }, 'email failed'));
  }
}

export async function processFanout(job: FanoutJob): Promise<void> {
  if (job.kind === 'post') await fanoutPost(job.postId);
  else if (job.kind === 'message') await fanoutMessage(job.messageId);
  else if (job.kind === 'report') await fanoutReport(job.reportId);
  else await fanoutWikiEdit(job.pageId, job.revisionId);
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  url: string;
  data: { title?: string; excerpt?: string; community?: string };
  readAt: Date | null;
  createdAt: Date;
  actorName: string | null;
  actorImage: string | null;
}

export async function listNotifications(
  userId: string,
  opts: { before?: string; limit?: number; unreadOnly?: boolean } = {},
): Promise<{ items: NotificationView[]; hasMore: boolean }> {
  const limit = Math.min(50, opts.limit ?? 30);
  const where = [eq(schema.notifications.userId, userId)];
  if (opts.before) where.push(lt(schema.notifications.id, opts.before));
  if (opts.unreadOnly) where.push(isNull(schema.notifications.readAt));
  const rows = await db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      url: schema.notifications.url,
      data: schema.notifications.data,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      actorName: schema.users.name,
      actorImage: schema.users.image,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
    .where(and(...where))
    .orderBy(desc(schema.notifications.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return Math.min(row?.n ?? 0, 999);
}

export async function markNotificationsRead(userId: string, raw: unknown): Promise<void> {
  const ids = z.union([z.literal('all'), z.array(z.string().uuid()).max(100)]).parse(raw);
  const where = [eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)];
  if (ids !== 'all') where.push(inArray(schema.notifications.id, ids));
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(...where));
  realtime().to(rooms.user(userId)).emit('notification:read', { ids });
}

const settingsSchema = z.object({
  emailMentions: z.boolean(),
  emailReplies: z.boolean(),
  emailModeration: z.boolean(),
  autoFollow: z.boolean(),
});

export async function getNotificationSettings(userId: string) {
  const row = await db.query.notificationSettings.findFirst({
    where: eq(schema.notificationSettings.userId, userId),
  });
  return {
    emailMentions: row?.emailMentions ?? true,
    emailReplies: row?.emailReplies ?? false,
    emailModeration: row?.emailModeration ?? true,
    autoFollow: row?.autoFollow ?? true,
  };
}

export async function updateNotificationSettings(userId: string, raw: unknown): Promise<void> {
  const input = settingsSchema.parse(raw);
  await db
    .insert(schema.notificationSettings)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: schema.notificationSettings.userId, set: input });
}

const muteSchema = z.object({
  targetType: z.enum(['community', 'channel', 'thread']),
  targetId: z.string().uuid(),
  seconds: z
    .number()
    .int()
    .min(0)
    .max(30 * 86400)
    .default(0),
});

export async function setMute(userId: string, raw: unknown, muted: boolean): Promise<void> {
  const input = muteSchema.parse(raw);
  if (!muted) {
    await db
      .delete(schema.mutes)
      .where(
        and(
          eq(schema.mutes.userId, userId),
          eq(schema.mutes.targetType, input.targetType),
          eq(schema.mutes.targetId, input.targetId),
        ),
      );
    return;
  }
  const until = input.seconds ? new Date(Date.now() + input.seconds * 1000) : null;
  await db
    .insert(schema.mutes)
    .values({ userId, targetType: input.targetType, targetId: input.targetId, until })
    .onConflictDoUpdate({
      target: [schema.mutes.userId, schema.mutes.targetType, schema.mutes.targetId],
      set: { until },
    });
}

export async function isMuted(
  userId: string,
  targetType: 'community' | 'channel' | 'thread',
  targetId: string,
) {
  const row = await db.query.mutes.findFirst({
    where: and(
      eq(schema.mutes.userId, userId),
      eq(schema.mutes.targetType, targetType),
      eq(schema.mutes.targetId, targetId),
    ),
  });
  return Boolean(row && (!row.until || row.until > new Date()));
}

export interface MuteView {
  targetType: 'community' | 'channel' | 'thread';
  targetId: string;
  label: string;
  community: string | null;
  href: string | null;
  until: Date | null;
}

/** Active mutes with something human-readable to show for each. */
export async function listMutes(userId: string): Promise<MuteView[]> {
  const rows = (await db.query.mutes.findMany({ where: eq(schema.mutes.userId, userId) })).filter(
    (m) => !m.until || m.until > new Date(),
  );
  const ids = (type: string) => rows.filter((r) => r.targetType === type).map((r) => r.targetId);
  const [communities, channels, threads] = await Promise.all([
    ids('community').length
      ? db
          .select({
            id: schema.communities.id,
            name: schema.communities.name,
            slug: schema.communities.slug,
          })
          .from(schema.communities)
          .where(inArray(schema.communities.id, ids('community')))
      : [],
    ids('channel').length
      ? db
          .select({
            id: schema.channels.id,
            name: schema.channels.name,
            community: schema.communities.name,
            slug: schema.communities.slug,
          })
          .from(schema.channels)
          .innerJoin(schema.communities, eq(schema.communities.id, schema.channels.communityId))
          .where(inArray(schema.channels.id, ids('channel')))
      : [],
    ids('thread').length
      ? db
          .select({
            id: schema.threads.id,
            name: schema.threads.title,
            community: schema.communities.name,
            slug: schema.communities.slug,
          })
          .from(schema.threads)
          .innerJoin(schema.communities, eq(schema.communities.id, schema.threads.communityId))
          .where(inArray(schema.threads.id, ids('thread')))
      : [],
  ]);
  const byId = new Map<string, { label: string; community: string | null; href: string }>();
  for (const c of communities)
    byId.set(c.id, { label: c.name, community: null, href: `/c/${c.slug}` });
  for (const c of channels)
    byId.set(c.id, {
      label: `#${c.name}`,
      community: c.community,
      href: `/c/${c.slug}/forum/${c.name}`,
    });
  for (const t of threads)
    byId.set(t.id, { label: t.name, community: t.community, href: `/c/${t.slug}/t/${t.id}` });
  return rows
    .filter((r) => byId.has(r.targetId))
    .map((r) => {
      const info = byId.get(r.targetId)!;
      return {
        targetType: r.targetType,
        targetId: r.targetId,
        label: info.label,
        community: info.community,
        href: info.href,
        until: r.until,
      };
    });
}
