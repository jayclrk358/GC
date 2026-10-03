import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import {
  automodMessage,
  automodSchema,
  DEFAULT_AUTOMOD,
  has,
  linkHost,
  newId,
  normalizeForMatch,
  Permission,
  scanContent,
  type AutomodConfig,
  type AutomodHit,
} from '@gamecentral/shared';
import { requirePerm, type MemberContext } from '../access';
import { env } from '../env';
import { AppError, forbidden } from '../errors';
import { logger } from '../logger';
import { cacheRedis } from '../redis';
import { audit } from './audit';
import { deliver, holdersOf, notifyUser } from './notify';
import { removeFromVoice } from './voice-rooms';

const log = logger('automod');

interface AutomodState {
  config: AutomodConfig;
  joinsPausedUntil: Date | null;
}

// Every post checks the rules, so keep them for a few seconds rather than asking each time.
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; value: AutomodState }>();

export async function getAutomod(communityId: string): Promise<AutomodState> {
  const hit = cache.get(communityId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const row = await db.query.automodSettings.findFirst({
    where: eq(schema.automodSettings.communityId, communityId),
  });
  // Stored rules that no longer fit the schema (an older shape, say) fall back to the defaults
  // rather than failing every post in the community.
  const parsed = row ? automodSchema.safeParse(row.config) : null;
  if (parsed && !parsed.success) {
    log.warn({ communityId, err: parsed.error.message }, 'stored automod config is invalid');
  }
  const value = {
    config: parsed?.success ? parsed.data : DEFAULT_AUTOMOD,
    joinsPausedUntil: row?.joinsPausedUntil ?? null,
  };
  if (cache.size > 5000) cache.clear();
  cache.set(communityId, { at: Date.now(), value });
  return value;
}

export async function saveAutomod(ctx: MemberContext, raw: unknown): Promise<AutomodConfig> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const config = automodSchema.parse(raw);
  config.words.list = [...new Set(config.words.list)];
  config.links.allow = [...new Set(config.links.allow)];
  // Only this community's roles can be exempt.
  if (config.exemptRoleIds.length) {
    const roles = await db.query.roles.findMany({
      where: eq(schema.roles.communityId, ctx.community.id),
      columns: { id: true },
    });
    const ids = new Set(roles.map((r) => r.id));
    config.exemptRoleIds = config.exemptRoleIds.filter((id) => ids.has(id));
  }
  await db
    .insert(schema.automodSettings)
    .values({ communityId: ctx.community.id, config })
    .onConflictDoUpdate({
      target: schema.automodSettings.communityId,
      set: { config, updatedAt: new Date() },
    });
  cache.delete(ctx.community.id);
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'automod.update',
    diff: {
      words: config.words.enabled ? config.words.list.length : 'off',
      links: config.links.enabled ? config.links.allow : 'off',
      invites: config.invites.enabled,
      spam: config.spam.enabled,
      newMembers: config.newMembers.enabled,
      joins: config.joins.enabled,
    },
  });
  return config;
}

/** Let people join again before a raid pause runs out. */
export async function resumeJoins(ctx: MemberContext): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  await db
    .update(schema.automodSettings)
    .set({ joinsPausedUntil: null })
    .where(eq(schema.automodSettings.communityId, ctx.community.id));
  cache.delete(ctx.community.id);
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'automod.joins_resumed',
  });
}

// ── Checking posts ──────────────────────────────────────────────────────────

export interface AutomodTarget {
  kind: 'message' | 'thread' | 'reply';
  channelId: string;
  threadId?: string;
  /** The author's permissions in the channel. */
  perms: bigint;
  text: string;
  title?: string;
  links: string[];
  mentions: number;
  /** What was sent, kept to post later if a moderator approves it. */
  payload: Record<string, unknown>;
  /** An edit can't wait for approval: anything that would be held is refused instead. */
  edit?: boolean;
}

function anyRuleOn(c: AutomodConfig): boolean {
  return (
    c.words.enabled ||
    c.links.enabled ||
    c.invites.enabled ||
    c.spam.enabled ||
    c.newMembers.enabled
  );
}

/** Moderators, administrators, the owner and exempt roles aren't checked. */
function exempt(ctx: MemberContext, config: AutomodConfig, perms: bigint): boolean {
  return (
    ctx.isOwner ||
    has(ctx.base, Permission.ADMINISTRATOR) ||
    has(perms, Permission.MANAGE_MESSAGES) ||
    ctx.roleIds.some((id) => config.exemptRoleIds.includes(id))
  );
}

/** Count something in Redis over a window (automod's own counters: rate limits can be off). */
async function bump(key: string, windowSeconds: number): Promise<number> {
  const [[, count]] = (await cacheRedis()
    .multi()
    .incr(key)
    .expire(key, windowSeconds, 'NX')
    .exec()) as [[null, number], [null, number]];
  return count;
}

async function newMemberHit(ctx: MemberContext, config: AutomodConfig): Promise<AutomodHit | null> {
  const rule = config.newMembers;
  if (!rule.enabled || (!rule.minAccountAgeHours && !rule.minMemberMinutes)) return null;
  const [row] = await db
    .select({ joinedAt: schema.members.joinedAt, since: schema.users.createdAt })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(
      and(eq(schema.members.communityId, ctx.community.id), eq(schema.members.userId, ctx.userId!)),
    )
    .limit(1);
  if (!row) return null;
  const now = Date.now();
  const young = now - row.since.getTime() < rule.minAccountAgeHours * 3600_000;
  const fresh = now - row.joinedAt.getTime() < rule.minMemberMinutes * 60_000;
  return young || fresh ? { rule: 'newMember', action: rule.action } : null;
}

/** Time someone out for flooding, as automod (no moderator involved). */
async function autoTimeout(ctx: MemberContext, minutes: number): Promise<void> {
  const until = new Date(Date.now() + minutes * 60_000);
  await db
    .update(schema.members)
    .set({ timeoutUntil: until })
    .where(
      and(eq(schema.members.communityId, ctx.community.id), eq(schema.members.userId, ctx.userId!)),
    );
  await db
    .update(schema.communities)
    .set({ permVersion: sql`${schema.communities.permVersion} + 1` })
    .where(eq(schema.communities.id, ctx.community.id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: null,
    action: 'member.timeout',
    targetType: 'user',
    targetId: ctx.userId!,
    reason: 'Automod: sending messages too fast',
    diff: { until: until.toISOString() },
  });
  await removeFromVoice(ctx.community.id, ctx.userId!);
  await notifyUser({
    userId: ctx.userId!,
    type: 'moderation',
    communityId: ctx.community.id,
    actorId: null,
    url: `/c/${ctx.community.slug}`,
    data: {
      title: `You're timed out in ${ctx.community.name} for ${minutes} minutes for sending messages too fast`,
      community: ctx.community.name,
    },
  });
}

/**
 * Check a post against the community's automod rules before it's saved. Throws to refuse it,
 * or (for "hold" rules) keeps it in the mod queue and throws a "held" result for the author.
 */
export async function enforceAutomod(ctx: MemberContext, target: AutomodTarget): Promise<void> {
  if (!ctx.userId) return;
  const { config } = await getAutomod(ctx.community.id);
  if (!anyRuleOn(config) || exempt(ctx, config, target.perms)) return;

  if (config.spam.enabled && target.kind === 'message' && !target.edit) {
    const sent = await bump(`am:flood:${ctx.community.id}:${ctx.userId}`, 10);
    if (sent > config.spam.maxPerTenSeconds) {
      // Time out once, when the limit is first passed, not for every message after.
      if (config.spam.timeoutMinutes && sent === config.spam.maxPerTenSeconds + 1) {
        await autoTimeout(ctx, config.spam.timeoutMinutes);
      }
      throw new AppError('rate_limited', 'Slow down: you’re sending messages too fast.', {
        retryAfter: 10,
      });
    }
    const said = normalizeForMatch(target.text).trim();
    if (config.spam.duplicates && said) {
      const hash = createHash('sha1').update(said).digest('base64url').slice(0, 16);
      const times = await bump(`am:dup:${ctx.community.id}:${ctx.userId}:${hash}`, 60);
      if (times >= 3) {
        throw new AppError('forbidden', 'You’ve sent that a few times already. Try something new.');
      }
    }
  }

  const ownHost = linkHost(env().APP_URL);
  const content = scanContent(
    ownHost
      ? { ...config, links: { ...config.links, allow: [...config.links.allow, ownHost] } }
      : config,
    {
      text: target.title ? `${target.title}\n${target.text}` : target.text,
      links: target.links,
      mentions: target.mentions,
    },
  );
  const hits = [content, target.edit ? null : await newMemberHit(ctx, config)].filter(
    (h): h is AutomodHit => h !== null,
  );
  const block = hits.find((h) => h.action === 'block' || target.edit);
  if (block) throw new AppError('forbidden', automodMessage(block, target.edit ? 'edit' : 'block'));
  const hold = hits[0];
  if (hold) await holdPost(ctx, target, hold);
}

async function holdPost(ctx: MemberContext, target: AutomodTarget, hit: AutomodHit) {
  await db.insert(schema.heldPosts).values({
    id: newId(),
    communityId: ctx.community.id,
    authorId: ctx.userId!,
    kind: target.kind,
    channelId: target.channelId,
    threadId: target.threadId ?? null,
    payload: target.payload,
    title: target.title ?? null,
    text: target.text.slice(0, 4000),
    rule: hit.rule,
    match: hit.match ?? null,
  });
  // Let moderators know, at most every ten minutes.
  const fresh = await cacheRedis().set(`am:held-alert:${ctx.community.id}`, '1', 'EX', 600, 'NX');
  if (fresh) {
    const mods = await holdersOf(
      ctx.community.id,
      ctx.community.ownerId,
      Permission.MANAGE_MESSAGES,
    );
    await deliver(
      [...mods].slice(0, 50).map((userId) => ({
        userId,
        type: 'moderation' as const,
        communityId: ctx.community.id,
        actorId: null,
        url: `/c/${ctx.community.slug}/settings/mod-queue`,
        data: { title: 'Automod is holding posts for review', community: ctx.community.name },
      })),
    ).catch((err: Error) => log.warn({ err: err.message }, 'held alert failed'));
  }
  throw new AppError('held', automodMessage(hit, 'hold'));
}

// ── Joins (raid protection) ─────────────────────────────────────────────────

/** Banned from the community (a ban that hasn't run out). */
async function bannedFrom(communityId: string, userId: string): Promise<boolean> {
  const [ban] = await db
    .select({ expiresAt: schema.bans.expiresAt })
    .from(schema.bans)
    .where(and(eq(schema.bans.communityId, communityId), eq(schema.bans.userId, userId)))
    .limit(1);
  return Boolean(ban && (!ban.expiresAt || ban.expiresAt > new Date()));
}

/** How long a join counts towards the limit, and a rejoin is ignored. */
const JOIN_WINDOW_SECONDS = 60;

/**
 * Called before someone (not yet a member) joins: refuses while joining is paused, and pauses it
 * when too many people join at once. Only distinct newcomers count: not someone banned here
 * (they're turned away anyway), and not someone leaving and joining again within the minute, so
 * one account can't lock everyone else out.
 */
export async function checkJoinAllowed(
  community: Pick<MemberContext['community'], 'id' | 'ownerId' | 'slug' | 'name'>,
  userId: string,
): Promise<void> {
  const { config, joinsPausedUntil } = await getAutomod(community.id);
  if (joinsPausedUntil && joinsPausedUntil > new Date()) {
    throw forbidden('New joins are paused for a few minutes. Please try again soon.');
  }
  if (!config.joins.enabled) return;
  if (await bannedFrom(community.id, userId)) return;
  const first = await cacheRedis().set(
    `am:joiner:${community.id}:${userId}`,
    '1',
    'EX',
    JOIN_WINDOW_SECONDS,
    'NX',
  );
  if (!first) return;
  const joins = await bump(`am:joins:${community.id}`, JOIN_WINDOW_SECONDS);
  if (joins <= config.joins.maxPerMinute) return;
  const until = new Date(Date.now() + config.joins.pauseMinutes * 60_000);
  await db
    .update(schema.automodSettings)
    .set({ joinsPausedUntil: until })
    .where(eq(schema.automodSettings.communityId, community.id));
  cache.delete(community.id);
  await audit(db, {
    communityId: community.id,
    actorId: null,
    action: 'automod.joins_paused',
    diff: { until: until.toISOString(), joinsInAMinute: joins },
  });
  const mods = await holdersOf(community.id, community.ownerId, Permission.MANAGE_COMMUNITY);
  await deliver(
    [...mods].slice(0, 50).map((userId) => ({
      userId,
      type: 'moderation' as const,
      communityId: community.id,
      actorId: null,
      url: `/c/${community.slug}/settings/automod`,
      data: {
        title: `Joining is paused for ${config.joins.pauseMinutes} minutes: lots of people joined at once`,
        community: community.name,
      },
    })),
  ).catch((err: Error) => log.warn({ err: err.message }, 'raid alert failed'));
  throw forbidden('New joins are paused for a few minutes. Please try again soon.');
}
