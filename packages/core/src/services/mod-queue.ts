import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { has, Permission, type AutomodRule } from '@magnox/shared';
import { z } from 'zod';
import { getMemberContext, requirePerm, type MemberContext } from '../access';
import { AppError, notFound } from '../errors';
import { logger } from '../logger';
import { audit } from './audit';
import { sendMessage } from './chat';
import { createReply, createThread } from './forum';
import { notifyUser } from './notify';

const log = logger('mod-queue');

// The mod queue: posts automod held back, for moderators to let through or turn away.

export interface HeldPostView {
  id: string;
  kind: 'message' | 'thread' | 'reply';
  status: 'pending' | 'approved' | 'rejected';
  rule: AutomodRule;
  match: string | null;
  title: string | null;
  text: string;
  createdAt: string;
  reviewedAt: string | null;
  channel: { id: string; name: string; type: string };
  thread: { id: string; title: string } | null;
  author: { id: string; name: string; username: string | null; image: string | null };
  reviewerName: string | null;
  /** Where the post ended up, once approved. */
  resultUrl: string | null;
}

export async function heldPostCount(ctx: MemberContext): Promise<number> {
  if (!has(ctx.base, Permission.MANAGE_MESSAGES)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.heldPosts)
    .where(
      and(
        eq(schema.heldPosts.communityId, ctx.community.id),
        eq(schema.heldPosts.status, 'pending'),
      ),
    );
  return row?.n ?? 0;
}

const statusSchema = z.enum(['pending', 'approved', 'rejected']).default('pending');

function resultUrl(
  slug: string,
  kind: HeldPostView['kind'],
  resultId: string | null,
  threadId: string | null,
) {
  if (!resultId) return null;
  if (kind === 'message') return `/c/${slug}/m/${resultId}`;
  if (kind === 'thread') return `/c/${slug}/t/${resultId}`;
  return threadId ? `/c/${slug}/t/${threadId}/p/${resultId}` : null;
}

export async function listHeldPosts(
  ctx: MemberContext,
  rawStatus: unknown,
): Promise<HeldPostView[]> {
  requirePerm(ctx, Permission.MANAGE_MESSAGES);
  const status = statusSchema.parse(rawStatus);
  const reviewer = db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .as('reviewer');
  const rows = await db
    .select({
      held: schema.heldPosts,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      channelName: schema.channels.name,
      channelType: schema.channels.type,
      threadTitle: schema.threads.title,
      reviewerName: reviewer.name,
    })
    .from(schema.heldPosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.heldPosts.authorId))
    .innerJoin(schema.channels, eq(schema.channels.id, schema.heldPosts.channelId))
    .leftJoin(schema.threads, eq(schema.threads.id, schema.heldPosts.threadId))
    .leftJoin(reviewer, eq(reviewer.id, schema.heldPosts.reviewerId))
    .where(
      and(eq(schema.heldPosts.communityId, ctx.community.id), eq(schema.heldPosts.status, status)),
    )
    .orderBy(
      status === 'pending' ? asc(schema.heldPosts.createdAt) : desc(schema.heldPosts.reviewedAt),
    )
    .limit(100);
  return rows.map((r) => ({
    id: r.held.id,
    kind: r.held.kind,
    status: r.held.status,
    rule: r.held.rule,
    match: r.held.match,
    title: r.held.title,
    text: r.held.text,
    createdAt: r.held.createdAt.toISOString(),
    reviewedAt: r.held.reviewedAt?.toISOString() ?? null,
    channel: { id: r.held.channelId, name: r.channelName, type: r.channelType },
    thread: r.held.threadId && r.threadTitle ? { id: r.held.threadId, title: r.threadTitle } : null,
    author: { id: r.held.authorId, name: r.name, username: r.username, image: r.image },
    reviewerName: r.reviewerName,
    resultUrl: resultUrl(ctx.community.slug, r.held.kind, r.held.resultId, r.held.threadId),
  }));
}

const decisionSchema = z.enum(['approve', 'reject']);

/** Approve (post it, as its author, as it was sent) or reject a held post. */
export async function reviewHeldPost(
  ctx: MemberContext,
  id: string,
  rawDecision: unknown,
): Promise<{ url: string | null }> {
  requirePerm(ctx, Permission.MANAGE_MESSAGES);
  const decision = decisionSchema.parse(rawDecision);
  if (!z.string().uuid().safeParse(id).success) throw notFound('Post');
  // Claim it first, so two moderators can't both act on it.
  const [held] = await db
    .update(schema.heldPosts)
    .set({
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewerId: ctx.userId,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(schema.heldPosts.id, id),
        eq(schema.heldPosts.communityId, ctx.community.id),
        eq(schema.heldPosts.status, 'pending'),
      ),
    )
    .returning();
  if (!held) throw new AppError('conflict', 'Someone already dealt with this post.');

  const where = held.kind === 'message' ? 'message' : held.kind === 'thread' ? 'thread' : 'reply';
  let url: string | null = null;
  if (decision === 'approve') {
    try {
      const author = await getMemberContext({ id: ctx.community.id }, held.authorId);
      if (!author.isMember) {
        throw new AppError('conflict', 'They’re not a member any more, so this can’t be posted.');
      }
      let resultId: string;
      if (held.kind === 'message') {
        resultId = (await sendMessage(author, held.channelId, held.payload, { approved: true })).id;
      } else if (held.kind === 'thread') {
        resultId = (await createThread(author, held.payload, { approved: true })).id;
      } else {
        resultId = (await createReply(author, held.threadId!, held.payload, { approved: true })).id;
      }
      await db.update(schema.heldPosts).set({ resultId }).where(eq(schema.heldPosts.id, held.id));
      url = resultUrl(ctx.community.slug, held.kind, resultId, held.threadId);
    } catch (e) {
      // Couldn't post it (e.g. the channel's gone, or they're timed out now): back in the queue.
      await db
        .update(schema.heldPosts)
        .set({ status: 'pending', reviewerId: null, reviewedAt: null })
        .where(eq(schema.heldPosts.id, held.id));
      throw e;
    }
  }

  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: decision === 'approve' ? 'automod.approve' : 'automod.reject',
    targetType: 'user',
    targetId: held.authorId,
    diff: { kind: held.kind, rule: held.rule },
  });
  await notifyUser({
    userId: held.authorId,
    type: 'moderation',
    communityId: ctx.community.id,
    actorId: null,
    url: url ?? `/c/${ctx.community.slug}`,
    data: {
      title:
        decision === 'approve'
          ? `Your ${where} in ${ctx.community.name} was approved`
          : `Your ${where} in ${ctx.community.name} wasn’t approved`,
      excerpt: (held.title ?? held.text).slice(0, 140),
      community: ctx.community.name,
    },
  }).catch((err: Error) => log.warn({ err: err.message }, 'held post notification failed'));
  return { url };
}
