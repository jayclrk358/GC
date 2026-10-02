import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { z } from 'zod';
import { staffContext } from '../access';
import { AppError, forbidden, notFound } from '../errors';
import {
  assertOutranks,
  disconnectUser,
  markSessionsRevoked,
  platformAdminFor,
  recordStaffAction,
  requireStaff,
  staffRank,
  staffRoleOf,
  type StaffRole,
} from './admin';
import { eraseAccount, ownedCommunities } from './account';
import { deleteMessage } from './chat';
import { deletePost } from './forum';
import { queueMediaCleanup } from './media-cleanup';
import { notifyUser } from './notify';

// The parts of the console for looking after people and what they post: who's on the team,
// changing someone's account, and finding and removing posts anywhere on Magnox.

// ── The team ────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: StaffRole;
}

export async function listStaff(userId: string | null): Promise<StaffMember[]> {
  await requireStaff(userId, 'staff');
  const u = schema.users;
  const rows = await db
    .select({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      banned: u.banned,
    })
    .from(u)
    .where(
      or(inArray(u.role, ['admin', 'moderator']), sql`lower(${u.email}) = any(${ownerEmails()})`),
    )
    .limit(200);
  return rows
    .map((r) => ({ ...r, role: staffRoleOf(r) }))
    .filter((r): r is typeof r & { role: StaffRole } => r.role !== null)
    .sort((a, b) => staffRank(b.role) - staffRank(a.role) || a.name.localeCompare(b.name))
    .map(({ id, name, username, email, role }) => ({ id, name, username, email, role }));
}

function ownerEmails(): SQL {
  const list = [...new Set((process.env.PLATFORM_ADMIN_EMAILS ?? '').split(','))]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length
    ? sql`ARRAY[${sql.join(
        list.map((e) => sql`${e}`),
        sql`, `,
      )}]::text[]`
    : sql`ARRAY[]::text[]`;
}

const staffRoleSchema = z.object({
  /** Their email, @username or account id. */
  who: z.string().trim().min(1, 'Who?').max(320),
  role: z.enum(['admin', 'moderator', 'none']),
});

/** Find someone by email, @username or id. */
async function findPerson(who: string) {
  const handle = who.replace(/^@/, '').toLowerCase();
  const u = schema.users;
  const [row] = await db
    .select({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      banned: u.banned,
      deletedAt: u.deletedAt,
    })
    .from(u)
    .where(
      or(eq(u.id, who), sql`lower(${u.email}) = ${handle}`, sql`lower(${u.username}) = ${handle}`),
    )
    .limit(1);
  if (!row || row.deletedAt) throw notFound('Person');
  return row;
}

/**
 * Give someone a staff role, change it, or take it away. Admins manage moderators; only the
 * owner manages admins. The owner's own access comes from the server's settings, not from here.
 */
export async function setStaffRole(userId: string | null, raw: unknown): Promise<StaffMember> {
  const me = await requireStaff(userId, 'staff');
  const input = staffRoleSchema.parse(raw);
  const target = await findPerson(input.who);
  if (target.id === me.id) throw new AppError('bad_request', 'You can’t change your own access.');
  const current = staffRoleOf(target);
  if (current === 'owner') {
    throw new AppError(
      'bad_request',
      'The owner’s access is set in the server settings (PLATFORM_ADMIN_EMAILS).',
    );
  }
  const touchesAdmin = current === 'admin' || input.role === 'admin';
  if (touchesAdmin && me.role !== 'owner')
    throw forbidden('Only the owner can add or change admins.');
  if (input.role !== 'none' && target.banned) {
    throw new AppError('bad_request', 'They’re banned: lift the ban first.');
  }
  const role = input.role === 'none' ? 'user' : input.role;
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, target.id));
  await recordStaffAction(
    me,
    input.role === 'none' ? 'staff.revoke' : 'staff.grant',
    { type: 'user', id: target.id },
    { role: input.role, before: current },
  );
  if (input.role !== 'none' && input.role !== current) {
    await notifyUser({
      userId: target.id,
      communityId: null,
      actorId: me.id,
      type: 'system',
      url: '/admin',
      data: {
        title: `You’re now a Magnox ${input.role}. The admin console is in your account menu.`,
      },
    }).catch(() => undefined);
  }
  return {
    id: target.id,
    name: target.name,
    username: null,
    email: target.email,
    role: (input.role === 'none' ? null : input.role) as StaffRole,
  };
}

// ── Changing someone's account ───────────────────────────────────────────────

/** Same rule as sign-up (see packages/auth). */
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

const userEditSchema = z.object({
  name: z.string().trim().min(1, 'Give them a name.').max(64).optional(),
  username: z
    .string()
    .trim()
    .regex(USERNAME_RE, '3–24 letters, numbers, dots or underscores.')
    .optional(),
  /** Clear what they wrote on their profile (bio, status, pronouns, location, links). */
  clearProfileText: z.boolean().optional(),
  removeAvatar: z.boolean().optional(),
  removeBanner: z.boolean().optional(),
  /** Mark their email as confirmed (they proved it some other way). */
  verifyEmail: z.boolean().optional(),
});

/** Fix up someone's account: an offensive name, a profile that breaks the rules, and so on. */
export async function adminUpdateUser(
  userId: string | null,
  targetId: string,
  raw: unknown,
): Promise<void> {
  const me = await requireStaff(userId, 'users');
  await assertOutranks(me, targetId);
  const input = userEditSchema.parse(raw);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, targetId) });
  if (!user || user.deletedAt) throw notFound('Person');
  const profile = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.userId, targetId),
  });
  const changed: string[] = [];
  const userPatch: Partial<typeof schema.users.$inferInsert> = {};
  if (input.name !== undefined && input.name !== user.name) {
    userPatch.name = input.name;
    changed.push('name');
  }
  if (input.username !== undefined && input.username.toLowerCase() !== user.username) {
    const taken = await db.query.users.findFirst({
      where: eq(schema.users.username, input.username.toLowerCase()),
      columns: { id: true },
    });
    if (taken) {
      throw new AppError('validation', 'That username is taken.', {
        fields: { username: 'Taken' },
      });
    }
    userPatch.username = input.username.toLowerCase();
    userPatch.displayUsername = input.username;
    changed.push('username');
  }
  if (input.verifyEmail && !user.emailVerified) {
    userPatch.emailVerified = true;
    changed.push('emailVerified');
  }
  const media: string[] = [];
  const profilePatch: Partial<typeof schema.userProfiles.$inferInsert> = {};
  if (input.clearProfileText && profile) {
    Object.assign(profilePatch, { bio: '', status: '', pronouns: '', location: '', links: [] });
    changed.push('profileText');
  }
  if (input.removeAvatar && (profile?.avatarKey || user.image)) {
    profilePatch.avatarKey = null;
    userPatch.image = null;
    if (profile?.avatarKey) media.push(profile.avatarKey);
    changed.push('avatar');
  }
  if (input.removeBanner && profile?.bannerKey) {
    profilePatch.bannerKey = null;
    media.push(profile.bannerKey);
    changed.push('banner');
  }
  if (!changed.length) return;
  await db.transaction(async (tx) => {
    if (Object.keys(userPatch).length) {
      await tx.update(schema.users).set(userPatch).where(eq(schema.users.id, targetId));
    }
    if (profile && Object.keys(profilePatch).length) {
      await tx
        .update(schema.userProfiles)
        .set(profilePatch)
        .where(eq(schema.userProfiles.userId, targetId));
    }
  });
  if (media.length) {
    await queueMediaCleanup({
      kind: 'refs',
      refs: media.map((key) => ({ key, authorId: targetId })),
    });
  }
  await recordStaffAction(me, 'user.edit', { type: 'user', id: targetId }, { changed });
}

const deleteUserSchema = z.object({
  /** Their username (or email), typed to confirm. */
  confirm: z.string().trim(),
  removeContent: z.boolean().default(false),
  reason: z.string().trim().min(3, 'Say why, for the record.').max(500),
});

/** Delete someone's account for them, as if they had (admins and the owner only). */
export async function adminDeleteUser(
  userId: string | null,
  targetId: string,
  raw: unknown,
): Promise<void> {
  const me = await requireStaff(userId, 'suspend');
  await assertOutranks(me, targetId);
  const input = deleteUserSchema.parse(raw);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, targetId) });
  if (!user || user.deletedAt) throw notFound('Person');
  const expected = (user.username ?? user.email).toLowerCase();
  if (input.confirm.replace(/^@/, '').toLowerCase() !== expected) {
    throw new AppError('validation', 'Type it exactly to confirm.', {
      fields: { confirm: 'Doesn’t match' },
    });
  }
  const owned = await ownedCommunities(targetId);
  if (owned.length) {
    throw new AppError(
      'conflict',
      `They own communities: ${owned.map((c) => c.name).join(', ')}. Delete those (or have them handed over) first.`,
    );
  }
  await eraseAccount(targetId, input.removeContent);
  await markSessionsRevoked(targetId);
  disconnectUser(targetId);
  await recordStaffAction(
    me,
    'user.delete',
    { type: 'user', id: targetId },
    { reason: input.reason, removeContent: input.removeContent, name: user.name },
  );
}

// ── Posts and messages, anywhere ────────────────────────────────────────────

export type ContentKind = 'message' | 'post';

export interface ContentItem {
  kind: ContentKind;
  id: string;
  /** A thread's opening post (removing it removes the thread). */
  opensThread: boolean;
  threadTitle: string | null;
  excerpt: string;
  url: string;
  createdAt: string;
  author: { id: string; name: string; username: string | null; avatar: string | null } | null;
  community: { id: string; name: string; slug: string };
  channel: string;
}

const contentFilterSchema = z.object({
  q: z.string().trim().max(100).catch(''),
  kind: z.enum(['all', 'message', 'post']).catch('all'),
  /** A username. */
  author: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^@/, '').toLowerCase())
    .catch(''),
  /** A community's address. */
  community: z.string().trim().toLowerCase().max(60).catch(''),
});

const EXCERPT = 280;

/** Find what people have written, newest first: search, or filter by person or community. */
export async function adminContent(userId: string | null, raw: unknown): Promise<ContentItem[]> {
  await requireStaff(userId, 'content');
  const f = contentFilterSchema.parse(raw ?? {});
  const authorId = f.author
    ? ((
        await db.query.users.findFirst({
          where: eq(schema.users.username, f.author),
          columns: { id: true },
        })
      )?.id ?? null)
    : undefined;
  if (authorId === null) return [];
  const communityId = f.community
    ? ((
        await db.query.communities.findFirst({
          where: eq(schema.communities.slug, f.community),
          columns: { id: true },
        })
      )?.id ?? null)
    : undefined;
  if (communityId === null) return [];
  const [messages, posts] = await Promise.all([
    f.kind === 'post' ? [] : findMessages(f.q, authorId, communityId),
    f.kind === 'message' ? [] : findPosts(f.q, authorId, communityId),
  ]);
  return [...messages, ...posts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);
}

async function findMessages(
  q: string,
  authorId: string | undefined,
  communityId: string | undefined,
): Promise<ContentItem[]> {
  const m = schema.messages;
  const where: SQL[] = [isNull(m.deletedAt), eq(m.kind, 'user')];
  if (q) where.push(sql`${m.search} @@ websearch_to_tsquery('simple', ${q})`);
  if (authorId) where.push(eq(m.authorId, authorId));
  if (communityId) where.push(eq(m.communityId, communityId));
  const rows = await db
    .select({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      channel: schema.channels.name,
      communityId: schema.communities.id,
      communityName: schema.communities.name,
      slug: schema.communities.slug,
      authorId: schema.users.id,
      authorName: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
    })
    .from(m)
    .innerJoin(schema.channels, eq(schema.channels.id, m.channelId))
    .innerJoin(schema.communities, eq(schema.communities.id, m.communityId))
    .leftJoin(schema.users, eq(schema.users.id, m.authorId))
    .where(and(...where))
    .orderBy(desc(m.id))
    .limit(60);
  return rows.map((r) => ({
    kind: 'message',
    id: r.id,
    opensThread: false,
    threadTitle: null,
    excerpt: r.content.slice(0, EXCERPT),
    url: `/c/${r.slug}/m/${r.id}`,
    createdAt: r.createdAt.toISOString(),
    author: r.authorId
      ? { id: r.authorId, name: r.authorName!, username: r.username, avatar: r.image }
      : null,
    community: { id: r.communityId, name: r.communityName, slug: r.slug },
    channel: r.channel,
  }));
}

async function findPosts(
  q: string,
  authorId: string | undefined,
  communityId: string | undefined,
): Promise<ContentItem[]> {
  const p = schema.posts;
  const t = schema.threads;
  const where: SQL[] = [isNull(p.deletedAt), isNull(t.deletedAt)];
  if (q) {
    where.push(
      sql`(${p.search} @@ websearch_to_tsquery('simple', ${q}) or (${p.isOp} and ${t.search} @@ websearch_to_tsquery('simple', ${q})))`,
    );
  }
  if (authorId) where.push(eq(p.authorId, authorId));
  if (communityId) where.push(eq(p.communityId, communityId));
  const rows = await db
    .select({
      id: p.id,
      bodyText: p.bodyText,
      isOp: p.isOp,
      threadId: t.id,
      title: t.title,
      createdAt: p.createdAt,
      channel: schema.channels.name,
      communityId: schema.communities.id,
      communityName: schema.communities.name,
      slug: schema.communities.slug,
      authorId: schema.users.id,
      authorName: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
    })
    .from(p)
    .innerJoin(t, eq(t.id, p.threadId))
    .innerJoin(schema.channels, eq(schema.channels.id, t.channelId))
    .innerJoin(schema.communities, eq(schema.communities.id, p.communityId))
    .leftJoin(schema.users, eq(schema.users.id, p.authorId))
    .where(and(...where))
    .orderBy(desc(p.id))
    .limit(60);
  return rows.map((r) => ({
    kind: 'post',
    id: r.id,
    opensThread: r.isOp,
    threadTitle: r.title,
    excerpt: r.bodyText.slice(0, EXCERPT),
    url: `/c/${r.slug}/t/${r.threadId}/p/${r.id}`,
    createdAt: r.createdAt.toISOString(),
    author: r.authorId
      ? { id: r.authorId, name: r.authorName!, username: r.username, avatar: r.image }
      : null,
    community: { id: r.communityId, name: r.communityName, slug: r.slug },
    channel: r.channel,
  }));
}

const removeSchema = z.object({
  kind: z.enum(['message', 'post']),
  id: z.string().uuid(),
  reason: z.string().trim().min(3, 'Say why, for the record.').max(500),
});

/**
 * Remove a message or post (a thread's opening post takes the thread with it), the way the
 * community's own moderators would: everyone watching sees it go, and the community's audit log
 * shows it too.
 */
export async function adminRemoveContent(userId: string | null, raw: unknown): Promise<void> {
  const me = await requireStaff(userId, 'content');
  const input = removeSchema.parse(raw);
  const table = input.kind === 'message' ? schema.messages : schema.posts;
  const [row] = await db
    .select({ communityId: table.communityId, authorId: table.authorId })
    .from(table)
    .where(eq(table.id, input.id))
    .limit(1);
  if (!row) throw notFound(input.kind === 'message' ? 'Message' : 'Post');
  // Someone on the team: only a higher role removes what they wrote.
  if (row.authorId && row.authorId !== me.id) {
    const author = await platformAdminFor(row.authorId);
    if (author && staffRank(author.role) >= staffRank(me.role)) {
      throw forbidden('That was written by staff: only someone above them can remove it.');
    }
  }
  const ctx = await staffContext(row.communityId, me.id);
  if (input.kind === 'message') await deleteMessage(ctx, input.id);
  else await deletePost(ctx, input.id, input.reason);
  await recordStaffAction(
    me,
    `${input.kind}.remove`,
    { type: input.kind, id: input.id },
    { reason: input.reason, communityId: row.communityId, authorId: row.authorId },
  );
}
