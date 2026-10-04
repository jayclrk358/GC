import { and, count, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { newId, uuidAtTime, type PaidPlanId } from '@gamecentral/shared';
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

// The platform admin console: Game Central staff looking after the whole site (not one community).

const log = logger('admin');

/**
 * Game Central staff. The owner runs the site (listed in PLATFORM_ADMIN_EMAILS with that email
 * confirmed, so nobody can claim it by signing up first); admins can do everything but manage
 * other admins; moderators look after people, posts, reports and feedback.
 */
export type StaffRole = 'owner' | 'admin' | 'moderator';
export const STAFF_ROLES: readonly StaffRole[] = ['owner', 'admin', 'moderator'];

/** What a part of the console needs. */
export type StaffAbility =
  | 'console'
  | 'users'
  | 'content'
  | 'reports'
  | 'feedback'
  | 'communities'
  | 'suspend'
  | 'plans'
  | 'log'
  | 'staff';

const MODERATOR: StaffAbility[] = [
  'console',
  'users',
  'content',
  'reports',
  'feedback',
  'communities',
];
const ABILITIES: Record<StaffRole, ReadonlySet<StaffAbility>> = {
  owner: new Set([...MODERATOR, 'suspend', 'plans', 'log', 'staff']),
  admin: new Set([...MODERATOR, 'suspend', 'plans', 'log', 'staff']),
  moderator: new Set(MODERATOR),
};

/** Owner 3, admin 2, moderator 1, everyone else 0: staff act only on people ranked below them. */
export function staffRank(role: StaffRole | null): number {
  return role ? 3 - STAFF_ROLES.indexOf(role) : 0;
}

export function staffCan(role: StaffRole | null, ability: StaffAbility): boolean {
  return Boolean(role && ABILITIES[role].has(ability));
}

export interface PlatformAdmin {
  id: string;
  name: string;
  role: StaffRole;
}

/** Someone's staff role, if any. A ban takes it away. */
export function staffRoleOf(user: {
  role?: string | null;
  email: string;
  emailVerified?: boolean | null;
  banned?: boolean | null;
}): StaffRole | null {
  if (user.banned) return null;
  if (user.emailVerified && platformAdminEmails().has(user.email.toLowerCase())) return 'owner';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'moderator') return 'moderator';
  return null;
}

/** A staff role as others see it: the owner shows as an admin, so who owns Game Central stays private. */
export type PublicStaffRole = Exclude<StaffRole, 'owner'>;

export function publicStaffRole(user: Parameters<typeof staffRoleOf>[0]): PublicStaffRole | null {
  const role = staffRoleOf(user);
  return role === 'owner' ? 'admin' : role;
}

/** Whether an account is Game Central staff of any kind (and so sees the console). */
export function isPlatformAdminUser(user: Parameters<typeof staffRoleOf>[0]): boolean {
  return staffRoleOf(user) !== null;
}

export async function platformAdminFor(userId: string | null): Promise<PlatformAdmin | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, email: true, emailVerified: true, role: true, banned: true },
  });
  const role = user ? staffRoleOf(user) : null;
  return user && role ? { id: user.id, name: user.name, role } : null;
}

/** The staff member doing this, if their role allows it. */
export async function requireStaff(
  userId: string | null,
  ability: StaffAbility = 'console',
): Promise<PlatformAdmin> {
  const admin = await platformAdminFor(userId);
  if (!admin) throw forbidden('Only Game Central staff can do that.');
  if (!staffCan(admin.role, ability)) throw forbidden('Your staff role doesn’t include that.');
  return admin;
}

const requireAdmin = requireStaff;

/** Staff can only act on people ranked below them (and never on themselves). */
export async function assertOutranks(admin: PlatformAdmin, targetId: string): Promise<void> {
  if (targetId === admin.id) throw new AppError('bad_request', 'You can’t do that to yourself.');
  const target = await platformAdminFor(targetId);
  if (target && staffRank(target.role) >= staffRank(admin.role)) {
    throw forbidden('They’re staff too: only someone above them can do that.');
  }
}

export async function recordStaffAction(
  admin: PlatformAdmin,
  action: string,
  target: { type: 'community' | 'user' | 'message' | 'post' | 'thread' | 'feedback'; id: string },
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

const record = recordStaffAction;

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
  await requireAdmin(userId, 'communities');
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
  await requireAdmin(userId, 'communities');
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
  const admin = await requireAdmin(userId, 'plans');
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
  const admin = await requireAdmin(userId, 'plans');
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
  const admin = await requireAdmin(userId, 'suspend');
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
  const admin = await requireAdmin(userId, 'suspend');
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
  await markSessionsStale(userId);
  disconnectUser(userId);
}

/**
 * Note that someone's account changed without them doing it (staff renamed them, say): while the
 * mark lasts, signed-in pages read their session fresh rather than from the cookie's copy.
 */
export async function markSessionsStale(userId: string): Promise<void> {
  await cacheRedis().set(sessionsRevokedKey(userId), '1', 'EX', 15 * 60);
}

/** Close someone's live connections: they reconnect signed in only if their session still is. */
export function disconnectUser(userId: string): void {
  realtime().in(rooms.user(userId)).disconnectSockets(true);
}

export async function adminUsers(userId: string | null, rawQ: unknown) {
  await requireAdmin(userId, 'users');
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
  const viewer = await requireAdmin(userId, 'users');
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
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    banned: Boolean(user.banned),
    banReason: user.banReason,
    banExpires: user.banExpires,
    createdAt: user.createdAt,
    staffRole: staffRoleOf(user),
    /** Whether the viewer may act on them (ban, edit...): only people ranked below. */
    manageable: user.id !== viewer.id && staffRank(staffRoleOf(user)) < staffRank(viewer.role),
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

/** Ban someone from Game Central: they're signed out everywhere and can't sign back in. */
export async function banUser(userId: string | null, targetId: string, raw: unknown) {
  const admin = await requireAdmin(userId, 'users');
  await assertOutranks(admin, targetId);
  const input = banSchema.parse(raw);
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
  const admin = await requireAdmin(userId, 'users');
  await assertOutranks(admin, targetId);
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
  const admin = await requireAdmin(userId, 'users');
  await assertOutranks(admin, targetId);
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId));
  await markSessionsRevoked(targetId);
  await record(admin, 'user.sessions.revoke', { type: 'user', id: targetId });
}

/**
 * Turn off someone's two-factor sign-in, when they've lost their authenticator app and their
 * backup codes. Admins only (not moderators): it leaves the account with just its password or
 * sign-in provider. Their sessions end too, in case it's someone else asking for the reset.
 */
export async function resetTwoFactor(userId: string | null, targetId: string) {
  const admin = await requireAdmin(userId, 'suspend');
  await assertOutranks(admin, targetId);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.users)
      .set({ twoFactorEnabled: false })
      .where(eq(schema.users.id, targetId))
      .returning({ id: schema.users.id });
    if (!row) throw notFound('Person');
    await tx.delete(schema.twoFactors).where(eq(schema.twoFactors.userId, targetId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, targetId));
  });
  await markSessionsRevoked(targetId);
  await record(admin, 'user.2fa.reset', { type: 'user', id: targetId });
}

// ── Reports and the log ─────────────────────────────────────────────────────

/** Open reports across every community, newest first, for trust and safety to keep an eye on. */
export async function platformReports(userId: string | null) {
  await requireAdmin(userId, 'reports');
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
  await requireAdmin(userId, 'log');
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
