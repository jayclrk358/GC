import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { CURRENT_TERMS_VERSION } from '@magnox/shared';
import { z } from 'zod';
import { AppError, unauthorized } from '../errors';
import { logger } from '../logger';
import { enforceRateLimit } from '../ratelimit';
import { mediaUrl } from '../storage';
import { removeMember } from './members';
import { queueMediaCleanup } from './media-cleanup';
import { removeFromVoice } from './voice-rooms';

// The person's own account: agreeing to the terms, downloading their data, and leaving for good.

const log = logger('account');

// ── Terms and age ───────────────────────────────────────────────────────────

export interface Consent {
  /** The terms version they agreed to (0: none yet). */
  termsVersion: number;
  /** They've said they're 18 or over (for communities marked 18+). */
  adult: boolean;
}

export async function getConsent(userId: string): Promise<Consent> {
  const row = await db.query.userConsents.findFirst({
    where: eq(schema.userConsents.userId, userId),
  });
  return { termsVersion: row?.termsVersion ?? 0, adult: Boolean(row?.adultAt) };
}

/** They agree to the current terms and say they're old enough to use Magnox (13+). */
export async function acceptTerms(userId: string | null): Promise<void> {
  if (!userId) throw unauthorized();
  const now = new Date();
  await db
    .insert(schema.userConsents)
    .values({ userId, termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: now })
    .onConflictDoUpdate({
      target: schema.userConsents.userId,
      set: { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: now },
    });
}

/** They say they're 18 or over, to see communities marked 18+. */
export async function confirmAdult(userId: string | null): Promise<void> {
  if (!userId) throw unauthorized();
  await db
    .insert(schema.userConsents)
    .values({ userId, adultAt: new Date() })
    .onConflictDoUpdate({ target: schema.userConsents.userId, set: { adultAt: new Date() } });
}

// ── Your data ───────────────────────────────────────────────────────────────

const EXPORT_LIMIT = 50_000;

/**
 * Everything Magnox keeps about someone, as one JSON document (GDPR access/portability): the
 * account, profile and settings, communities, and what they've written.
 */
export async function exportAccount(userId: string | null): Promise<Record<string, unknown>> {
  if (!userId) throw unauthorized();
  await enforceRateLimit(
    `export:${userId}`,
    3,
    3600,
    'You can download your data three times an hour.',
  );
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw unauthorized();
  const [
    profile,
    preferences,
    notificationSettings,
    consent,
    memberships,
    owned,
    messages,
    threads,
    posts,
    wikiRevisions,
    rsvps,
    applications,
    reports,
    uploads,
    blocks,
    accounts,
    apiTokens,
  ] = await Promise.all([
    db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, userId) }),
    db.query.userPreferences.findFirst({ where: eq(schema.userPreferences.userId, userId) }),
    db.query.notificationSettings.findFirst({
      where: eq(schema.notificationSettings.userId, userId),
    }),
    db.query.userConsents.findFirst({ where: eq(schema.userConsents.userId, userId) }),
    db
      .select({
        community: schema.communities.name,
        slug: schema.communities.slug,
        nickname: schema.members.nickname,
        joinedAt: schema.members.joinedAt,
      })
      .from(schema.members)
      .innerJoin(schema.communities, eq(schema.communities.id, schema.members.communityId))
      .where(eq(schema.members.userId, userId)),
    db
      .select({ name: schema.communities.name, slug: schema.communities.slug })
      .from(schema.communities)
      .where(and(eq(schema.communities.ownerId, userId), isNull(schema.communities.deletedAt))),
    db
      .select({
        community: schema.communities.name,
        channel: schema.channels.name,
        content: schema.messages.content,
        attachments: schema.messages.attachments,
        createdAt: schema.messages.createdAt,
        editedAt: schema.messages.editedAt,
        deleted: sql<boolean>`${schema.messages.deletedAt} is not null`,
      })
      .from(schema.messages)
      .innerJoin(schema.channels, eq(schema.channels.id, schema.messages.channelId))
      .innerJoin(schema.communities, eq(schema.communities.id, schema.messages.communityId))
      .where(eq(schema.messages.authorId, userId))
      .orderBy(desc(schema.messages.id))
      .limit(EXPORT_LIMIT),
    db
      .select({ title: schema.threads.title, createdAt: schema.threads.createdAt })
      .from(schema.threads)
      .where(eq(schema.threads.authorId, userId))
      .limit(EXPORT_LIMIT),
    db
      .select({
        thread: schema.threads.title,
        text: schema.posts.bodyText,
        createdAt: schema.posts.createdAt,
        editedAt: schema.posts.editedAt,
      })
      .from(schema.posts)
      .innerJoin(schema.threads, eq(schema.threads.id, schema.posts.threadId))
      .where(eq(schema.posts.authorId, userId))
      .orderBy(desc(schema.posts.id))
      .limit(EXPORT_LIMIT),
    db
      .select({
        page: schema.wikiPages.title,
        summary: schema.wikiRevisions.summary,
        createdAt: schema.wikiRevisions.createdAt,
      })
      .from(schema.wikiRevisions)
      .innerJoin(schema.wikiPages, eq(schema.wikiPages.id, schema.wikiRevisions.pageId))
      .where(eq(schema.wikiRevisions.authorId, userId))
      .limit(EXPORT_LIMIT),
    db
      .select({ event: schema.events.title, status: schema.eventRsvps.status })
      .from(schema.eventRsvps)
      .innerJoin(schema.events, eq(schema.events.id, schema.eventRsvps.eventId))
      .where(eq(schema.eventRsvps.userId, userId)),
    db
      .select({
        community: schema.communities.name,
        answers: schema.applications.answers,
        status: schema.applications.status,
        createdAt: schema.applications.createdAt,
      })
      .from(schema.applications)
      .innerJoin(schema.communities, eq(schema.communities.id, schema.applications.communityId))
      .where(eq(schema.applications.userId, userId)),
    db
      .select({
        reason: schema.reports.reason,
        details: schema.reports.details,
        createdAt: schema.reports.createdAt,
      })
      .from(schema.reports)
      .where(eq(schema.reports.reporterId, userId)),
    db
      .select({ key: schema.uploads.key, createdAt: schema.uploads.createdAt })
      .from(schema.uploads)
      .where(eq(schema.uploads.ownerId, userId))
      .limit(EXPORT_LIMIT),
    db
      .select({ name: schema.users.name, username: schema.users.username })
      .from(schema.userBlocks)
      .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
      .where(eq(schema.userBlocks.userId, userId)),
    db
      .select({ provider: schema.accounts.providerId, createdAt: schema.accounts.createdAt })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId)),
    db
      .select({
        name: schema.apiTokens.name,
        prefix: schema.apiTokens.prefix,
        scopes: schema.apiTokens.scopes,
        lastUsedAt: schema.apiTokens.lastUsedAt,
        createdAt: schema.apiTokens.createdAt,
      })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      twoFactorEnabled: user.twoFactorEnabled,
      signInMethods: accounts,
    },
    consent: consent ?? null,
    profile: profile ?? null,
    preferences: preferences?.prefs ?? {},
    notificationSettings: notificationSettings ?? null,
    communities: { memberOf: memberships, owns: owned },
    messages: messages.map((m) => ({
      ...m,
      attachments: m.attachments.map((a) => ({ ...a, url: mediaUrl(a.key) })),
    })),
    threads,
    posts,
    wikiEdits: wikiRevisions,
    eventResponses: rsvps,
    applications,
    reportsMade: reports,
    uploads: uploads.map((u) => ({ ...u, url: mediaUrl(u.key) })),
    blocked: blocks,
    apiTokens,
    limits: `Each list holds up to ${EXPORT_LIMIT} items, newest first.`,
  };
}

// ── Leaving ─────────────────────────────────────────────────────────────────

const deleteSchema = z.object({
  /** Their username (or email, without one), typed to confirm. */
  confirm: z.string().trim(),
  /** Also take down their chat messages and forum replies. */
  removeContent: z.boolean().default(false),
});

/** Communities someone still owns (they have to hand them over or delete them before leaving). */
export async function ownedCommunities(userId: string) {
  return db
    .select({
      id: schema.communities.id,
      name: schema.communities.name,
      slug: schema.communities.slug,
    })
    .from(schema.communities)
    .where(and(eq(schema.communities.ownerId, userId), isNull(schema.communities.deletedAt)));
}

/**
 * Delete someone's account. Their personal data goes (profile, settings, sign-in methods,
 * memberships, notifications, files on their profile); what they wrote stays under
 * "Deleted user" unless they ask for that to go too. Sessions must also be ended by the caller
 * (Better Auth keeps them in Redis as well).
 */
export async function deleteAccount(userId: string | null, raw: unknown): Promise<void> {
  if (!userId) throw unauthorized();
  const input = deleteSchema.parse(raw);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw unauthorized();
  const expected = (user.username ?? user.email).toLowerCase();
  if (input.confirm.replace(/^@/, '').toLowerCase() !== expected) {
    throw new AppError('validation', 'Type it exactly to confirm.', {
      fields: { confirm: 'Doesn’t match' },
    });
  }
  const owned = await ownedCommunities(userId);
  if (owned.length) {
    throw new AppError(
      'conflict',
      `Hand over or delete the communities you own first: ${owned.map((c) => c.name).join(', ')}.`,
    );
  }

  const memberships = await db
    .select({ communityId: schema.members.communityId })
    .from(schema.members)
    .where(eq(schema.members.userId, userId));

  await db.transaction(async (tx) => {
    for (const m of memberships) await removeMember(tx, m.communityId, userId);
    if (input.removeContent) {
      await tx
        .update(schema.messages)
        .set({ deletedAt: new Date() })
        .where(and(eq(schema.messages.authorId, userId), isNull(schema.messages.deletedAt)));
      // Replies only: a thread's first post holds up everyone else's replies.
      await tx
        .update(schema.posts)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(schema.posts.authorId, userId),
            eq(schema.posts.isOp, false),
            isNull(schema.posts.deletedAt),
          ),
        );
    }
    const mine = <T extends { userId: unknown }>(t: T) => eq(t.userId as never, userId);
    await tx.delete(schema.sessions).where(mine(schema.sessions));
    await tx.delete(schema.pushSubscriptions).where(mine(schema.pushSubscriptions));
    await tx.delete(schema.apiTokens).where(mine(schema.apiTokens));
    await tx.delete(schema.accounts).where(mine(schema.accounts));
    await tx.delete(schema.twoFactors).where(mine(schema.twoFactors));
    await tx.delete(schema.verifications).where(eq(schema.verifications.identifier, user.email));
    await tx.delete(schema.userProfiles).where(mine(schema.userProfiles));
    await tx.delete(schema.userPreferences).where(mine(schema.userPreferences));
    await tx.delete(schema.userConsents).where(mine(schema.userConsents));
    await tx.delete(schema.notifications).where(mine(schema.notifications));
    await tx.delete(schema.notificationSettings).where(mine(schema.notificationSettings));
    await tx.delete(schema.userBlocks).where(mine(schema.userBlocks));
    await tx.delete(schema.userBlocks).where(eq(schema.userBlocks.blockedId, userId));
    await tx.delete(schema.threadFollows).where(mine(schema.threadFollows));
    await tx.delete(schema.threadReads).where(mine(schema.threadReads));
    await tx.delete(schema.readStates).where(mine(schema.readStates));
    await tx.delete(schema.eventRsvps).where(mine(schema.eventRsvps));
    await tx
      .delete(schema.applications)
      .where(and(mine(schema.applications), eq(schema.applications.status, 'pending')));
    await tx
      .update(schema.gameServers)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.gameServers.ownerId, userId), isNull(schema.gameServers.deletedAt)));
    await tx
      .update(schema.users)
      .set({
        name: 'Deleted user',
        email: `deleted-${userId}@users.invalid`.toLowerCase(),
        emailVerified: false,
        username: null,
        displayUsername: null,
        image: null,
        role: null,
        twoFactorEnabled: false,
        banned: true,
        banReason: 'Account deleted',
        deletedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  });

  for (const m of memberships) await removeFromVoice(m.communityId, userId).catch(() => undefined);
  // Profile pictures, and the files in what they wrote if that went too.
  await queueMediaCleanup({ kind: 'user', userId, content: input.removeContent });
  log.info(
    { userId, removeContent: input.removeContent, left: memberships.length },
    'account deleted',
  );
}
