import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { has, inviteInputSchema, Permission, randomToken } from '@magnox/shared';
import { requireMember, type MemberContext } from '../access';
import { AppError, forbidden, notFound, unauthorized } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { audit } from './audit';
import { checkJoinAllowed } from './automod';
import { addMember, memberJoined } from './members';

export async function createInvite(ctx: MemberContext, raw: unknown) {
  requireMember(ctx);
  if (!has(ctx.base, Permission.CREATE_INVITE)) throw forbidden("You can't create invites here.");
  const input = inviteInputSchema.parse(raw);
  await enforceRateLimit(`invite-create:${ctx.userId}`, 30, 3600);
  const code = randomToken(8);
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 3600_000)
    : null;
  await db.insert(schema.invites).values({
    code,
    communityId: ctx.community.id,
    creatorId: ctx.userId,
    maxUses: input.maxUses,
    expiresAt,
  });
  return { code, expiresAt, maxUses: input.maxUses };
}

export async function listInvites(ctx: MemberContext) {
  requireMember(ctx);
  const manage = has(ctx.base, Permission.MANAGE_INVITES);
  const where = [
    eq(schema.invites.communityId, ctx.community.id),
    sql`${schema.invites.revokedAt} is null`,
  ];
  if (!manage) where.push(eq(schema.invites.creatorId, ctx.userId!));
  return db
    .select({
      code: schema.invites.code,
      uses: schema.invites.uses,
      maxUses: schema.invites.maxUses,
      expiresAt: schema.invites.expiresAt,
      createdAt: schema.invites.createdAt,
      creatorName: schema.users.name,
    })
    .from(schema.invites)
    .leftJoin(schema.users, eq(schema.users.id, schema.invites.creatorId))
    .where(and(...where))
    .orderBy(desc(schema.invites.createdAt))
    .limit(100);
}

export async function revokeInvite(ctx: MemberContext, code: string) {
  requireMember(ctx);
  const invite = await db.query.invites.findFirst({
    where: and(eq(schema.invites.code, code), eq(schema.invites.communityId, ctx.community.id)),
  });
  if (!invite) throw notFound('Invite');
  if (invite.creatorId !== ctx.userId && !has(ctx.base, Permission.MANAGE_INVITES)) {
    throw forbidden();
  }
  await db
    .update(schema.invites)
    .set({ revokedAt: new Date() })
    .where(eq(schema.invites.code, code));
}

function inviteUsable(inv: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number;
  uses: number;
}) {
  if (inv.revokedAt) return false;
  if (inv.expiresAt && inv.expiresAt < new Date()) return false;
  if (inv.maxUses > 0 && inv.uses >= inv.maxUses) return false;
  return true;
}

/** Public preview of an invite. Invites deliberately reveal private communities. */
export async function getInvitePreview(code: string) {
  if (!/^[a-z0-9]{4,16}$/.test(code)) return null;
  const rows = await db
    .select({
      code: schema.invites.code,
      revokedAt: schema.invites.revokedAt,
      expiresAt: schema.invites.expiresAt,
      maxUses: schema.invites.maxUses,
      uses: schema.invites.uses,
      communityId: schema.communities.id,
      slug: schema.communities.slug,
      name: schema.communities.name,
      tagline: schema.communities.tagline,
      theme: schema.communities.theme,
      memberCount: schema.communities.memberCount,
      deletedAt: schema.communities.deletedAt,
      inviterName: schema.users.name,
    })
    .from(schema.invites)
    .innerJoin(schema.communities, eq(schema.communities.id, schema.invites.communityId))
    .leftJoin(schema.users, eq(schema.users.id, schema.invites.creatorId))
    .where(eq(schema.invites.code, code))
    .limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) return null;
  return { ...row, valid: inviteUsable(row) };
}

export async function acceptInvite(userId: string | null, code: string): Promise<{ slug: string }> {
  if (!userId) throw unauthorized();
  await enforceRateLimit(`invite-accept:${userId}`, 30, 3600);
  const joined = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.code, code))
      .for('update')
      .limit(1);
    const invite = rows[0];
    if (!invite || !inviteUsable(invite))
      throw new AppError('not_found', 'This invite is invalid or has expired.');
    const community = await tx.query.communities.findFirst({
      where: eq(schema.communities.id, invite.communityId),
    });
    if (!community || community.deletedAt) throw notFound('Community');
    if (community.archivedAt) {
      throw forbidden('This community is archived and isn’t taking new members.');
    }
    const already = await tx.query.members.findFirst({
      where: and(eq(schema.members.communityId, community.id), eq(schema.members.userId, userId)),
      columns: { userId: true },
    });
    if (!already) await checkJoinAllowed(community);
    const added = await addMember(tx, community.id, userId);
    if (added) {
      await tx
        .update(schema.invites)
        .set({ uses: sql`${schema.invites.uses} + 1` })
        .where(eq(schema.invites.code, code));
      await audit(tx, {
        communityId: community.id,
        actorId: userId,
        action: 'member.join.invite',
        targetType: 'invite',
        targetId: code,
      });
    }
    return { slug: community.slug, communityId: community.id, added };
  });
  if (joined.added) memberJoined(joined.communityId, userId);
  return { slug: joined.slug };
}
