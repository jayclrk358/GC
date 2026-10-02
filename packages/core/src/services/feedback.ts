import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_STATUSES,
  FEEDBACK_TITLE_MAX,
  isUuid,
  newId,
  type FeedbackKind,
  type FeedbackStatus,
} from '@magnox/shared';
import { z } from 'zod';
import { notFound, unauthorized } from '../errors';
import { enforceRateLimit } from '../ratelimit';
import { recordStaffAction, requireStaff } from './admin';
import { notifyUser } from './notify';

// Feedback: bugs, ideas and requests, and questions people send Magnox's team. They can follow
// what happens to each (a status, and replies); the team works through them in the console.

export interface FeedbackSummary {
  id: string;
  kind: FeedbackKind;
  title: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
  /** Replies from the team. */
  replies: number;
}

export interface FeedbackMessageView {
  id: string;
  body: string;
  fromStaff: boolean;
  internal: boolean;
  /** The person who wrote it (staff names are only shown to staff). */
  authorName: string | null;
  createdAt: string;
}

const submitSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  title: z.string().trim().min(3, 'Give it a short title.').max(FEEDBACK_TITLE_MAX),
  body: z
    .string()
    .trim()
    .min(10, 'Tell us a bit more (at least 10 characters).')
    .max(FEEDBACK_BODY_MAX),
  /** Where they were: a path on this site, nothing else. */
  page: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/(?!\/)\S*$/)
    .nullish()
    .catch(null),
});

/** Send the team some feedback. */
export async function submitFeedback(
  userId: string | null,
  raw: unknown,
  meta: { userAgent?: string | null } = {},
): Promise<{ id: string }> {
  if (!userId) throw unauthorized();
  await enforceRateLimit(
    `feedback:${userId}`,
    5,
    3600,
    'You’ve sent a lot of feedback in the last hour. Thanks! Please try again later.',
  );
  const input = submitSchema.parse(raw);
  const id = newId();
  await db.insert(schema.feedback).values({
    id,
    userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    page: input.page ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { id };
}

function summaries(rows: (typeof schema.feedback.$inferSelect & { replies: number })[]) {
  return rows.map((r): FeedbackSummary => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    replies: r.replies,
  }));
}

/** What someone has sent, newest first. */
export async function myFeedback(userId: string | null): Promise<FeedbackSummary[]> {
  if (!userId) throw unauthorized();
  const f = schema.feedback;
  const m = schema.feedbackMessages;
  const rows = await db
    .select({
      feedback: f,
      replies: count(m.id),
    })
    .from(f)
    .leftJoin(m, and(eq(m.feedbackId, f.id), eq(m.fromStaff, true), eq(m.internal, false)))
    .where(eq(f.userId, userId))
    .groupBy(f.id)
    .orderBy(desc(f.createdAt))
    .limit(100);
  return summaries(rows.map((r) => ({ ...r.feedback, replies: r.replies })));
}

async function loadFeedback(id: string) {
  if (!isUuid(id)) throw notFound('Feedback');
  const row = await db.query.feedback.findFirst({ where: eq(schema.feedback.id, id) });
  if (!row) throw notFound('Feedback');
  return row;
}

async function messagesOf(feedbackId: string, opts: { internal: boolean; staffNames: boolean }) {
  const m = schema.feedbackMessages;
  const rows = await db
    .select({
      id: m.id,
      body: m.body,
      fromStaff: m.fromStaff,
      internal: m.internal,
      createdAt: m.createdAt,
      authorName: schema.users.name,
    })
    .from(m)
    .leftJoin(schema.users, eq(schema.users.id, m.authorId))
    .where(and(eq(m.feedbackId, feedbackId), opts.internal ? undefined : eq(m.internal, false)))
    .orderBy(asc(m.createdAt));
  return rows.map((r): FeedbackMessageView => ({
    id: r.id,
    body: r.body,
    fromStaff: r.fromStaff,
    internal: r.internal,
    // The person who sent it hears from "the Magnox team", not a particular member of it.
    authorName: r.fromStaff && !opts.staffNames ? null : r.authorName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One of someone's own, with the team's replies. */
export async function myFeedbackItem(userId: string | null, id: string) {
  if (!userId) throw unauthorized();
  const row = await loadFeedback(id);
  if (row.userId !== userId) throw notFound('Feedback');
  return {
    ...summaries([{ ...row, replies: 0 }])[0]!,
    body: row.body,
    page: row.page,
    messages: await messagesOf(id, { internal: false, staffNames: false }),
  };
}

const replySchema = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(FEEDBACK_REPLY_MAX),
});

/** Add to your own feedback (answer a question from the team, say). */
export async function replyToMyFeedback(
  userId: string | null,
  id: string,
  raw: unknown,
): Promise<void> {
  if (!userId) throw unauthorized();
  await enforceRateLimit(
    `feedback-reply:${userId}`,
    20,
    3600,
    'Too many replies. Please slow down.',
  );
  const row = await loadFeedback(id);
  if (row.userId !== userId) throw notFound('Feedback');
  const input = replySchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx.insert(schema.feedbackMessages).values({
      id: newId(),
      feedbackId: id,
      authorId: userId,
      body: input.body,
    });
    await tx
      .update(schema.feedback)
      .set({ updatedAt: new Date() })
      .where(eq(schema.feedback.id, id));
  });
}

// ── The team's side ─────────────────────────────────────────────────────────

const listSchema = z.object({
  /** "open": new, planned or in progress. */
  status: z.enum(['open', 'all', ...FEEDBACK_STATUSES]).catch('open'),
  kind: z.enum(['all', ...FEEDBACK_KINDS]).catch('all'),
  q: z.string().trim().max(100).catch(''),
});

const OPEN: FeedbackStatus[] = ['new', 'planned', 'in_progress'];

export async function adminFeedbackList(userId: string | null, raw: unknown) {
  await requireStaff(userId, 'feedback');
  const filter = listSchema.parse(raw ?? {});
  const f = schema.feedback;
  const m = schema.feedbackMessages;
  const where: SQL[] = [];
  if (filter.status === 'open') where.push(inArray(f.status, OPEN));
  else if (filter.status !== 'all') where.push(eq(f.status, filter.status));
  if (filter.kind !== 'all') where.push(eq(f.kind, filter.kind));
  if (filter.q) {
    const pat = `%${filter.q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(or(ilike(f.title, pat), ilike(f.body, pat))!);
  }
  const [rows, byStatus] = await Promise.all([
    db
      .select({
        feedback: f,
        replies: count(m.id),
        name: schema.users.name,
        username: schema.users.username,
      })
      .from(f)
      .leftJoin(m, and(eq(m.feedbackId, f.id), eq(m.fromStaff, true), eq(m.internal, false)))
      .leftJoin(schema.users, eq(schema.users.id, f.userId))
      .where(where.length ? and(...where) : undefined)
      .groupBy(f.id, schema.users.name, schema.users.username)
      .orderBy(desc(f.createdAt))
      .limit(100),
    db.select({ status: f.status, n: count() }).from(f).groupBy(f.status),
  ]);
  return {
    items: rows.map((r) => ({
      ...summaries([{ ...r.feedback, replies: r.replies }])[0]!,
      from: r.feedback.userId
        ? { id: r.feedback.userId, name: r.name, username: r.username }
        : null,
    })),
    counts: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Partial<
      Record<FeedbackStatus, number>
    >,
  };
}

/** How much hasn't been looked at yet (for the console's menu). */
export async function newFeedbackCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.feedback)
    .where(eq(schema.feedback.status, 'new'));
  return row?.n ?? 0;
}

export async function adminFeedbackItem(userId: string | null, id: string) {
  await requireStaff(userId, 'feedback');
  const row = await loadFeedback(id);
  const from = row.userId
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, row.userId),
        columns: { id: true, name: true, username: true, email: true },
      })
    : null;
  return {
    ...summaries([{ ...row, replies: 0 }])[0]!,
    body: row.body,
    page: row.page,
    userAgent: row.userAgent,
    from: from ?? null,
    messages: await messagesOf(id, { internal: true, staffNames: true }),
  };
}

const staffReplySchema = replySchema.extend({ internal: z.boolean().default(false) });

/** Answer someone (they're told), or leave a note only the team sees. */
export async function adminReplyFeedback(
  userId: string | null,
  id: string,
  raw: unknown,
): Promise<void> {
  const me = await requireStaff(userId, 'feedback');
  const row = await loadFeedback(id);
  const input = staffReplySchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx.insert(schema.feedbackMessages).values({
      id: newId(),
      feedbackId: id,
      authorId: me.id,
      fromStaff: true,
      internal: input.internal,
      body: input.body,
    });
    await tx
      .update(schema.feedback)
      .set({ updatedAt: new Date() })
      .where(eq(schema.feedback.id, id));
  });
  if (!input.internal && row.userId) {
    await notifyUser({
      userId: row.userId,
      communityId: null,
      actorId: null,
      type: 'system',
      url: `/feedback/${id}`,
      data: { title: `The Magnox team replied: ${row.title}`, excerpt: input.body.slice(0, 140) },
    }).catch(() => undefined);
  }
}

const statusSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });

const STATUS_WORDS: Record<FeedbackStatus, string> = {
  new: 'new',
  planned: 'planned',
  in_progress: 'in progress',
  done: 'done',
  declined: 'not planned',
};

/** Move feedback along. The person who sent it hears about it. */
export async function adminSetFeedbackStatus(
  userId: string | null,
  id: string,
  raw: unknown,
): Promise<void> {
  const me = await requireStaff(userId, 'feedback');
  const row = await loadFeedback(id);
  const { status } = statusSchema.parse(raw);
  if (status === row.status) return;
  await db
    .update(schema.feedback)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.feedback.id, id));
  await recordStaffAction(
    me,
    'feedback.status',
    { type: 'feedback', id },
    { from: row.status, to: status },
  );
  if (row.userId && status !== 'new') {
    await notifyUser({
      userId: row.userId,
      communityId: null,
      actorId: null,
      type: 'system',
      url: `/feedback/${id}`,
      data: { title: `Your feedback is now ${STATUS_WORDS[status]}: ${row.title}` },
    }).catch(() => undefined);
  }
}
