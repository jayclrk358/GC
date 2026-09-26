import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { AppError, notFound, unauthorized } from '../errors';
import { enforceRateLimit } from '../ratelimit';

/**
 * Blocking is personal: the blocker stops getting notifications from the blocked user, and
 * the blocked user's posts are collapsed for them. It isn't a moderation action.
 */
export async function blockUser(userId: string | null, blockedId: string): Promise<void> {
  if (!userId) throw unauthorized();
  if (userId === blockedId) throw new AppError('bad_request', "You can't block yourself.");
  await enforceRateLimit(`block:${userId}`, 60, 3600);
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, blockedId) });
  if (!target) throw notFound('User');
  await db.insert(schema.userBlocks).values({ userId, blockedId }).onConflictDoNothing();
  // Stop following their updates too: nothing more to do, notifications are filtered at fan-out.
}

export async function unblockUser(userId: string | null, blockedId: string): Promise<void> {
  if (!userId) throw unauthorized();
  await db
    .delete(schema.userBlocks)
    .where(and(eq(schema.userBlocks.userId, userId), eq(schema.userBlocks.blockedId, blockedId)));
}

export async function listBlockedUsers(userId: string) {
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      blockedAt: schema.userBlocks.createdAt,
    })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
    .where(eq(schema.userBlocks.userId, userId))
    .orderBy(desc(schema.userBlocks.createdAt));
}

export async function hasBlocked(userId: string | null, otherId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await db.query.userBlocks.findFirst({
    where: and(eq(schema.userBlocks.userId, userId), eq(schema.userBlocks.blockedId, otherId)),
  });
  return Boolean(row);
}
