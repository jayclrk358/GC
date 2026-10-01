import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  applicationFormSchema,
  DEFAULT_APPLICATION_FORM,
  has,
  newId,
  onboardingSchema,
  parseApplicationAnswers,
  Permission,
  reviewSchema,
  type ApplicationAnswer,
  type ApplicationForm,
  type Onboarding,
} from '@magnox/shared';
import { z } from 'zod';
import { requireMember, requirePerm, type MemberContext } from '../access';
import { communityChanged } from '../emitter';
import { AppError, conflict, forbidden, notFound, unauthorized } from '../errors';
import { logger } from '../logger';
import { enforceRateLimit } from '../ratelimit';
import { audit } from './audit';
import { addMember } from './members';
import { deliver, holdersOf, maybeEmail } from './notify';

const log = logger('applications');

// ── The form ────────────────────────────────────────────────────────────────

export async function getApplicationForm(communityId: string): Promise<ApplicationForm> {
  const row = await db.query.applicationForms.findFirst({
    where: eq(schema.applicationForms.communityId, communityId),
  });
  return row?.form ?? DEFAULT_APPLICATION_FORM;
}

export async function saveApplicationForm(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const form = applicationFormSchema.parse(raw);
  const ids = new Set(form.questions.map((q) => q.id));
  if (ids.size !== form.questions.length) {
    throw new AppError('bad_request', 'Two questions have the same id.');
  }
  await db
    .insert(schema.applicationForms)
    .values({ communityId: ctx.community.id, form })
    .onConflictDoUpdate({ target: schema.applicationForms.communityId, set: { form } });
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'applications.form',
    diff: { questions: form.questions.length },
  });
}

// ── Applying ────────────────────────────────────────────────────────────────

export interface MyApplication {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  message: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** The viewer's latest application to this community, if any. */
export async function myApplication(ctx: MemberContext): Promise<MyApplication | null> {
  if (!ctx.userId) return null;
  const row = await db.query.applications.findFirst({
    where: and(
      eq(schema.applications.communityId, ctx.community.id),
      eq(schema.applications.userId, ctx.userId),
    ),
    orderBy: desc(schema.applications.createdAt),
  });
  return row
    ? {
        id: row.id,
        status: row.status,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      }
    : null;
}

export async function submitApplication(ctx: MemberContext, raw: unknown): Promise<{ id: string }> {
  if (!ctx.userId) throw unauthorized();
  if (ctx.isMember) throw new AppError('bad_request', "You're already a member.");
  if (ctx.community.joinMode !== 'apply') {
    throw new AppError('bad_request', "This community doesn't take applications.");
  }
  await enforceRateLimit(`apply:${ctx.userId}`, 5, 24 * 3600);
  const form = await getApplicationForm(ctx.community.id);
  const answers = parseApplicationAnswers(form, raw);
  const banned = await db.query.bans.findFirst({
    where: and(eq(schema.bans.communityId, ctx.community.id), eq(schema.bans.userId, ctx.userId)),
  });
  if (banned && (!banned.expiresAt || banned.expiresAt > new Date())) {
    throw forbidden("You can't apply to this community.");
  }
  const id = newId();
  try {
    await db.insert(schema.applications).values({
      id,
      communityId: ctx.community.id,
      userId: ctx.userId,
      answers,
    });
  } catch (e) {
    // The partial unique index: one open application at a time.
    if ((e as { code?: string }).code === '23505') {
      throw conflict('Your application is already waiting for a reply.');
    }
    throw e;
  }
  const [user, reviewers] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, ctx.userId) }),
    holdersOf(ctx.community.id, ctx.community.ownerId, Permission.REVIEW_APPLICATIONS),
  ]);
  const name = user?.name ?? 'Someone';
  const url = `/c/${ctx.community.slug}/settings/applications`;
  await deliver(
    [...reviewers].slice(0, 100).map((userId) => ({
      userId,
      type: 'application' as const,
      communityId: ctx.community.id,
      actorId: ctx.userId,
      targetType: 'application',
      targetId: id,
      url,
      data: { title: `${name} applied to join`, community: ctx.community.name },
    })),
  );
  for (const userId of [...reviewers].slice(0, 20)) {
    await maybeEmail(
      userId,
      'application',
      `${name} applied to join ${ctx.community.name}`,
      `There's a new application to review in ${ctx.community.name}.`,
      url,
      `application:${ctx.community.id}`,
    ).catch((err: Error) => log.warn({ err: err.message }, 'application email failed'));
  }
  return { id };
}

export async function withdrawApplication(ctx: MemberContext): Promise<void> {
  if (!ctx.userId) throw unauthorized();
  await db
    .update(schema.applications)
    .set({ status: 'withdrawn', reviewedAt: new Date() })
    .where(
      and(
        eq(schema.applications.communityId, ctx.community.id),
        eq(schema.applications.userId, ctx.userId),
        eq(schema.applications.status, 'pending'),
      ),
    );
}

// ── Reviewing ───────────────────────────────────────────────────────────────

export interface ApplicationView {
  id: string;
  status: MyApplication['status'];
  answers: ApplicationAnswer[];
  message: string;
  createdAt: string;
  reviewedAt: string | null;
  applicant: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    /** When they joined Magnox, to spot brand-new accounts. */
    since: string;
  };
  reviewerName: string | null;
}

export async function pendingApplicationCount(ctx: MemberContext): Promise<number> {
  if (!has(ctx.base, Permission.REVIEW_APPLICATIONS)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.communityId, ctx.community.id),
        eq(schema.applications.status, 'pending'),
      ),
    );
  return row?.n ?? 0;
}

const statusSchema = z.enum(['pending', 'approved', 'rejected']).default('pending');

export async function listApplications(
  ctx: MemberContext,
  rawStatus: unknown,
): Promise<ApplicationView[]> {
  requirePerm(ctx, Permission.REVIEW_APPLICATIONS);
  const status = statusSchema.parse(rawStatus);
  const reviewer = db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .as('reviewer');
  const rows = await db
    .select({
      app: schema.applications,
      name: schema.users.name,
      username: schema.users.username,
      image: schema.users.image,
      since: schema.users.createdAt,
      reviewerName: reviewer.name,
    })
    .from(schema.applications)
    .innerJoin(schema.users, eq(schema.users.id, schema.applications.userId))
    .leftJoin(reviewer, eq(reviewer.id, schema.applications.reviewerId))
    .where(
      and(
        eq(schema.applications.communityId, ctx.community.id),
        eq(schema.applications.status, status),
      ),
    )
    .orderBy(
      status === 'pending'
        ? asc(schema.applications.createdAt)
        : desc(schema.applications.reviewedAt),
    )
    .limit(100);
  return rows.map((r) => ({
    id: r.app.id,
    status: r.app.status,
    answers: r.app.answers,
    message: r.app.message,
    createdAt: r.app.createdAt.toISOString(),
    reviewedAt: r.app.reviewedAt?.toISOString() ?? null,
    applicant: {
      id: r.app.userId,
      name: r.name,
      username: r.username,
      image: r.image,
      since: r.since.toISOString(),
    },
    reviewerName: r.reviewerName,
  }));
}

/** Let someone in (they become a member) or turn them down, optionally with a message. */
export async function reviewApplication(
  ctx: MemberContext,
  id: string,
  raw: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.REVIEW_APPLICATIONS);
  if (!z.string().uuid().safeParse(id).success) throw notFound('Application');
  const input = reviewSchema.parse(raw);
  const app = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.applications)
      .where(
        and(eq(schema.applications.id, id), eq(schema.applications.communityId, ctx.community.id)),
      )
      .for('update')
      .limit(1);
    if (!row) throw notFound('Application');
    if (row.status !== 'pending') throw conflict('Someone has already answered this application.');
    if (input.decision === 'approve') await addMember(tx, ctx.community.id, row.userId);
    await tx
      .update(schema.applications)
      .set({
        status: input.decision === 'approve' ? 'approved' : 'rejected',
        reviewerId: ctx.userId,
        message: input.message,
        reviewedAt: new Date(),
      })
      .where(eq(schema.applications.id, id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: input.decision === 'approve' ? 'application.approve' : 'application.reject',
      targetType: 'user',
      targetId: row.userId,
      reason: input.message || undefined,
    });
    return row;
  });
  if (input.decision === 'approve') communityChanged(ctx.community.id, app.userId, 'members');
  const approved = input.decision === 'approve';
  const title = approved
    ? `You're in! Your application to ${ctx.community.name} was accepted`
    : `Your application to ${ctx.community.name} wasn't accepted`;
  const url = approved ? `/c/${ctx.community.slug}/welcome` : `/c/${ctx.community.slug}`;
  await deliver([
    {
      userId: app.userId,
      type: 'application',
      communityId: ctx.community.id,
      actorId: null,
      targetType: 'application',
      targetId: app.id,
      url,
      data: { title, excerpt: input.message, community: ctx.community.name },
    },
  ]);
  await maybeEmail(
    app.userId,
    'application',
    title,
    input.message ? `${title}.\n\n${input.message}` : `${title}.`,
    url,
    `application-result:${app.id}`,
  ).catch((err: Error) => log.warn({ err: err.message }, 'application result email failed'));
}

// ── Welcome steps (onboarding) ──────────────────────────────────────────────

export async function getOnboarding(communityId: string): Promise<Onboarding> {
  const row = await db.query.communities.findFirst({
    where: eq(schema.communities.id, communityId),
    columns: { settings: true },
  });
  return onboardingSchema.parse(row?.settings.onboarding ?? {});
}

export async function saveOnboarding(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const onboarding = onboardingSchema.parse(raw);
  const gated = onboarding.enabled && onboarding.requireAccept;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.communities)
      .set({
        settings: sql`${schema.communities.settings} || ${JSON.stringify({ onboarding })}::jsonb`,
        // Who can post depends on it, so cached permissions start over.
        permVersion: sql`${schema.communities.permVersion} + 1`,
      })
      .where(eq(schema.communities.id, ctx.community.id));
    // Turning the gate on only affects people who join from now: everyone already here counts as
    // having agreed, so they don't all go read-only at once.
    if (gated && !ctx.community.rulesGate) {
      await tx
        .update(schema.members)
        .set({ onboardedAt: new Date() })
        .where(
          and(
            eq(schema.members.communityId, ctx.community.id),
            sql`${schema.members.onboardedAt} is null`,
          ),
        );
    }
  });
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'onboarding.update',
    diff: { enabled: onboarding.enabled, rules: onboarding.rules.length },
  });
}

/** Whether the viewer has done the welcome steps (accepted the rules). */
export async function isOnboarded(ctx: MemberContext): Promise<boolean> {
  if (!ctx.userId || !ctx.isMember) return false;
  if (ctx.isOwner) return true;
  const row = await db.query.members.findFirst({
    where: and(
      eq(schema.members.communityId, ctx.community.id),
      eq(schema.members.userId, ctx.userId),
    ),
    columns: { onboardedAt: true },
  });
  return Boolean(row?.onboardedAt);
}

/** Finish the welcome steps: the rules are accepted, and posting opens up. */
export async function completeOnboarding(ctx: MemberContext): Promise<void> {
  requireMember(ctx);
  await db
    .update(schema.members)
    .set({ onboardedAt: new Date() })
    .where(
      and(
        eq(schema.members.communityId, ctx.community.id),
        eq(schema.members.userId, ctx.userId!),
        sql`${schema.members.onboardedAt} is null`,
      ),
    );
}
