import { and, count, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { newId, uuidAtTime, type PaidPlanId } from '@magnox/shared';
import { z } from 'zod';
import { platformAdminEmails } from '../env';
import { accessChanged, realtime } from '../emitter';
import { AppError, forbidden, notFound } from '../errors';
import { logger } from '../logger';
import { cacheRedis, sessionsRevokedKey } from '../redis';
import { rooms } from '../rooms';
import { syncCommunityPlan } from './billing';
import { notifyUser } from './notify';
import { endCommunityVoiceCalls } from './voice-rooms';

// The platform admin console: Magnox staff looking after the whole site (not one community).

const log = logger('admin');

export interface PlatformAdmin {
  id: string;
  name: string;
}

/**
 * Whether an account runs the platform: given the admin role (see `admin:grant`), or listed in
 * PLATFORM_ADMIN_EMAILS with that email confirmed (so nobody can claim it by signing up first).
 */
export function isPlatformAdminUser(user: {
  role?: string | null;
  email: string;
  emailVerified?: boolean | null;
  banned?: boolean | null;
}): boolean {
  if (user.banned) return false;
  if (user.role === 'admin') return true;
  return Boolean(user.emailVerified) && platformAdminEmails().has(user.email.toLowerCase());
}

export async function platformAdminFor(userId: string | null): Promise<PlatformAdmin | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, email: true, emailVerified: true, role: true, banned: true },
  });
  return user && isPlatformAdminUser(user) ? { id: user.id, name: user.name } : null;
}

async function requireAdmin(userId: string | null): Promise<PlatformAdmin> {
  const admin = await platformAdminFor(userId);
  if (!admin) throw forbidden('Only Magnox admins can do that.');
  return admin;
}

async function record(
  admin: PlatformAdmin,
  action: string,
  target: { type: 'community' | 'user'; id: string },
  details: Record<string, unknown> = {},
) {
  await db.insert(schema.adminActions).values({
    id: newId(),
    adminId: admin.id,
    action,
    targetType: target.type,
    targetId: target.id,
    details,
  });
  log.info({ adminId: admin.id, action, target }, 'admin action');
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function platformOverview(userId: string | null) {
  await requireAdmin(userId);
  const day = new Date(Date.now() - 86_400_000);
  const [[users], [newUsers], [communities], [paid], [gifted], [messages], [reports]] =
    await Promise.all([
      db.select({ n: count() }).from(schema.users),
      db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, day)),
      db
        .select({ n: count() })
        .from(schema.communities)
        .where(isNull(schema.communities.deletedAt)),
      db
        .select({ n: count() })
        .from(schema.communities)
        .where(
          and(isNull(schema.communities.deletedAt), sql`${schema.communities.plan} <> 'free'`),
        ),
      db.select({ n: count() }).from(schema.planGifts),
      db
        .select({ n: count() })
        .from(schema.messages)
        .where(gte(schema.messages.id, uuidAtTime(day))),
      db.select({ n: count() }).from(schema.reports).where(eq(schema.reports.status, 'open')),
    ]);
  return {
    users: users?.n ?? 0,
    newUsers: newUsers?.n ?? 0,
    communities: communities?.n ?? 0,
    paid: paid?.n ?? 0,
    gifted: gifted?.n ?? 0,
    messages: messages?.n ?? 0,
    openReports: reports?.n ?? 0,
  };
}

// ── Communities ─────────────────────────────────────────────────────────────

const pattern = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;

export async function adminCommunities(userId: string | null, rawQ: unknown) {
  await requireAdmin(userId);
  const q = z.string().trim().max(100).catch('').parse(rawQ);
  const c = schema.communities;
  return db
    .select({
      id: c.id,
      slug: c.slug,
      name: c.name,
      plan: c.plan,
      memberCount: c.memberCount,
      visibility: c.visibility,
      createdAt: c.createdAt,
      archivedAt: c.archivedAt,
      suspendedAt: c.suspendedAt,
      ownerName: schema.users.name,
      ownerUsername: schema.users.username,
      giftPlan: schema.planGifts.plan,
      giftExpiresAt: schema.planGifts.expiresAt,
    })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.ownerId))
    .leftJoin(schema.planGifts, eq(schema.planGifts.communityId, c.id))
    .where(
      and(
        isNull(c.deletedAt),
        q ? or(ilike(c.name, pattern(q)), ilike(c.slug, pattern(q))) : undefined,
      ),
    )
    .orderBy(desc(c.memberCount), desc(c.createdAt))
    .limit(50);
}

export async function adminCommunity(userId: string | null, id: string) {
  await requireAdmin(userId);
  if (!z.string().uuid().safeParse(id).success) throw notFound('Community');
  const c = schema.communities;
  const [row] = await db
    .select({
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      plan: c.plan,
      memberCount: c.memberCount,
      visibility: c.visibility,
      createdAt: c.createdAt,
      archivedAt: c.archivedAt,
      suspendedAt: c.suspendedAt,
      suspendReason: c.suspendReason,
      ownerId: c.ownerId,
      ownerName: schema.users.name,
      ownerUsername: schema.users.username,
    })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.ownerId))
    .where(and(eq(c.id, id), isNull(c.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Community');
  const [gift, subs, reports] = await Promise.all([
    db.query.planGifts.findFirst({ where: eq(schema.planGifts.communityId, id) }),
    db
      .select({
        plan: schema.communitySubscriptions.plan,
        status: schema.communitySubscriptions.status,
        interval: schema.communitySubscriptions.interval,
      })
      .from(schema.communitySubscriptions)
      .where(eq(schema.communitySubscriptions.communityId, id)),
    db
      .select({ n: count() })
      .from(schema.reports)
      .where(and(eq(schema.reports.communityId, id), eq(schema.reports.status, 'open'))),
  ]);
  return { ...row, gift: gift ?? null, subscriptions: subs, openReports: reports[0]?.n ?? 0 };
}

const giftSchema = z.object({
  plan: z.enum(['plus', 'pro']),
  /** Months it lasts; 0 for good. */
  months: z.number().int().min(0).max(120),
  note: z.string().trim().max(300).default(''),
});

/**
 * Give a community a paid plan for free: for some months, or for good. It sits alongside any
 * subscription (the better plan wins) and doesn't touch Stripe.
 */
export async function giftPlan(userId: string | null, communityId: string, raw: unknown) {
  const admin = await requireAdmin(userId);
  const input = giftSchema.parse(raw);
  const community = await db.query.communities.findFirst({
    where: and(eq(schema.communities.id, communityId), isNull(schema.communities.deletedAt)),
    columns: { id: true, name: true, slug: true, ownerId: true },
  });
  if (!community) throw notFound('Community');
  const expiresAt = input.months
    ? new Date(new Date().setMonth(new Date().getMonth() + input.months))
    : null;
  const values = {
    plan: input.plan as PaidPlanId,
    expiresAt,
    note: input.note,
    grantedBy: admin.id,
    createdAt: new Date(),
  };
  await db
    .insert(schema.planGifts)
    .values({ communityId, ...values })
    .onConflictDoUpdate({ target: schema.planGifts.communityId, set: values });
  await syncCommunityPlan(communityId);
  await record(
    admin,
    'plan.gift',
    { type: 'community', id: communityId },
    {
      plan: input.plan,
      expiresAt: expiresAt?.toISOString() ?? null,
      note: input.note,
    },
  );
  await notifyUser({
    userId: community.ownerId,
    type: 'system',
    communityId,
    actorId: null,
    url: `/c/${community.slug}/settings/billing`,
    data: {
      title: `${community.name} has been given the ${input.plan === 'pro' ? 'Pro' : 'Plus'} plan${
        expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ''
      }`,
      community: community.name,
    },
  }).catch(() => undefined);
}

export async function removePlanGift(userId: string | null, communityId: string) {
  const admin = await requireAdmin(userId);
  const removed = await db
    .delete(schema.planGifts)
    .where(eq(schema.planGifts.communityId, communityId))
    .returning({ plan: schema.planGifts.plan });
  if (!removed.length) throw notFound('Gifted plan');
  await syncCommunityPlan(communityId);
  await record(admin, 'plan.gift.remove', { type: 'community', id: communityId });
}

/** Gifts that have run out: drop them and put plans back to what's paid for (hourly). */
export async function expirePlanGifts(): Promise<number> {
  const expired = await db
    .delete(schema.planGifts)
    .where(and(isNotNull(schema.planGifts.expiresAt), lte(schema.planGifts.expiresAt, new Date())))
    .returning({ communityId: schema.planGifts.communityId });
  for (const g of expired) await syncCommunityPlan(g.communityId);
  return expired.length;
}

const suspendSchema = z.object({
  reason: z.string().trim().min(3, 'Say why, for the record.').max(500),
});

/** Take a community offline for breaking the rules (reversible; nothing is deleted). */
export async function suspendCommunity(userId: string | null, communityId: string, raw: unknown) {
  const admin = await requireAdmin(userId);
  const { reason } = suspendSchema.parse(raw);
  const [row] = await db
    .update(schema.communities)
    .set({
      suspendedAt: new Date(),
      suspendReason: reason,
      permVersion: sql`${schema.communities.permVersion} + 1`,
    })
    .where(and(eq(schema.communities.id, communityId), isNull(schema.communities.deletedAt)))
    .returning({ ownerId: schema.communities.ownerId, name: schema.communities.name });
  if (!row) throw notFound('Community');
  // Open pages there stop receiving live updates.
  accessChanged(communityId);
  await endCommunityVoiceCalls(communityId);
  await record(admin, 'community.suspend', { type: 'community', id: communityId }, { reason });
  await notifyUser({
    userId: row.ownerId,
    type: 'system',
    communityId: null,
    actorId: null,
    url: '/community-suspended',
    data: { title: `${row.name} has been suspended`, excerpt: reason },
  }).catch(() => undefined);
}

export async function unsuspendCommunity(userId: string | null, communityId: string) {
  const admin = await requireAdmin(userId);
  const [row] = await db
    .update(schema.communities)
    .set({
      suspendedAt: null,
      suspendReason: null,
      permVersion: sql`${schema.communities.permVersion} + 1`,
    })
    .where(eq(schema.communities.id, communityId))
    .returning({ id: schema.communities.id });
  if (!row) throw notFound('Community');
  await record(admin, 'community.unsuspend', { type: 'community', id: communityId });
}

/** Whether the community at an address was suspended (to explain the missing page). */
export async function isSuspended(slug: string): Promise<boolean> {
  const row = await db.query.communities.findFirst({
    where: and(
      eq(schema.communities.slug, slug.toLowerCase()),
      isNull(schema.communities.deletedAt),
    ),
    columns: { suspendedAt: true },
  });
  return Boolean(row?.suspendedAt);
}

// ── People ──────────────────────────────────────────────────────────────────

/**
 * Note that someone's sessions were ended. Signed-in pages trust a cached copy of the session for
 * a few minutes; while this mark lasts they check with the session store instead (see
 * `sessionsRevoked`). Their live connections are closed too: those were signed in when they
 * opened, and the realtime server checks again (with this mark) when they reconnect.
 */
export async function markSessionsRevoked(userId: string): Promise<void> {
  await cacheRedis().set(sessionsRevokedKey(userId), '1', 'EX', 15 * 60);
  disconnectUser(userId);
}

/** Close someone's live connections: they reconnect signed in only if their session still is. */
export function disconnectUser(userId: string): void {
  realtime().in(rooms.user(userId)).disconnectSockets(true);
}

export async function adminUsers(userId: string | null, rawQ: unknown) {
  await requireAdmin(userId);
  const q = z.string().trim().max(100).catch('').parse(rawQ);
  const u = schema.users;
  return db
    .select({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      banned: u.banned,
      banExpires: u.banExpires,
      createdAt: u.createdAt,
    })
    .from(u)
    .where(
      q
        ? or(ilike(u.name, pattern(q)), ilike(u.username, pattern(q)), ilike(u.email, pattern(q)))
        : undefined,
    )
    .orderBy(desc(u.createdAt))
    .limit(50);
}

export async function adminUser(userId: string | null, id: string) {
  await requireAdmin(userId);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) throw notFound('Person');
  const [owned, memberships, sessions, reported] = await Promise.all([
    db
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        slug: schema.communities.slug,
      })
      .from(schema.communities)
      .where(and(eq(schema.communities.ownerId, id), isNull(schema.communities.deletedAt)))
      .limit(50),
    db.select({ n: count() }).from(schema.members).where(eq(schema.members.userId, id)),
    db.select({ n: count() }).from(schema.sessions).where(eq(schema.sessions.userId, id)),
    db.select({ n: count() }).from(schema.reports).where(eq(schema.reports.targetUserId, id)),
  ]);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    banned: Boolean(user.banned),
    banReason: user.banReason,
    banExpires: user.banExpires,
    createdAt: user.createdAt,
    platformAdmin: Boolean(await platformAdminFor(user.id)),
    owned,
    memberships: memberships[0]?.n ?? 0,
    sessions: sessions[0]?.n ?? 0,
    timesReported: reported[0]?.n ?? 0,
  };
}

const banSchema = z.object({
  reason: z.string().trim().min(3, 'Say why, for the record.').max(500),
  /** Days; 0 for good. */
  days: z.number().int().min(0).max(3650),
});

/** Ban someone from Magnox: they're signed out everywhere and can't sign back in. */
export async function banUser(userId: string | null, targetId: string, raw: unknown) {
  const admin = await requireAdmin(userId);
  if (targetId === admin.id) throw new AppError('bad_request', 'You can’t ban yourself.');
  const input = banSchema.parse(raw);
  if (await platformAdminFor(targetId)) {
    throw new AppError('bad_request', 'Take away their admin access first.');
  }
  const banExpires = input.days ? new Date(Date.now() + input.days * 86_400_000) : null;
  const [row] = await db
    .update(schema.users)
    .set({ banned: true, banReason: input.reason, banExpires })
    .where(eq(schema.users.id, targetId))
    .returning({ id: schema.users.id });
  if (!row) throw notFound('Person');
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId));
  await markSessionsRevoked(targetId);
  await record(
    admin,
    'user.ban',
    { type: 'user', id: targetId },
    {
      reason: input.reason,
      expires: banExpires?.toISOString() ?? null,
    },
  );
}

export async function unbanUser(userId: string | null, targetId: string) {
  const admin = await requireAdmin(userId);
  const [row] = await db
    .update(schema.users)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(schema.users.id, targetId))
    .returning({ id: schema.users.id });
  if (!row) throw notFound('Person');
  await record(admin, 'user.unban', { type: 'user', id: targetId });
}

/** Sign someone out everywhere (e.g. a hijacked account). */
export async function revokeSessions(userId: string | null, targetId: string) {
  const admin = await requireAdmin(userId);
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId));
  await markSessionsRevoked(targetId);
  await record(admin, 'user.sessions.revoke', { type: 'user', id: targetId });
}

// ── Reports and the log ─────────────────────────────────────────────────────

/** Open reports across every community, newest first, for trust and safety to keep an eye on. */
export async function platformReports(userId: string | null) {
  await requireAdmin(userId);
  const r = schema.reports;
  return db
    .select({
      id: r.id,
      reason: r.reason,
      details: r.details,
      excerpt: r.excerpt,
      targetType: r.targetType,
      targetUserId: r.targetUserId,
      createdAt: r.createdAt,
      communityId: r.communityId,
      communityName: schema.communities.name,
      communitySlug: schema.communities.slug,
      targetName: schema.users.name,
    })
    .from(r)
    .innerJoin(schema.communities, eq(schema.communities.id, r.communityId))
    .leftJoin(schema.users, eq(schema.users.id, r.targetUserId))
    .where(and(eq(r.status, 'open'), isNull(schema.communities.deletedAt)))
    .orderBy(desc(r.id))
    .limit(100);
}

export async function adminLog(userId: string | null) {
  await requireAdmin(userId);
  const a = schema.adminActions;
  return db
    .select({
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      details: a.details,
      createdAt: a.createdAt,
      adminName: schema.users.name,
    })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.adminId))
    .orderBy(desc(a.createdAt))
    .limit(200);
}
