import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { discordLinkSchema, Permission } from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { env } from '../env';
import { AppError, notFound } from '../errors';
import { logger } from '../logger';
import { enqueue, QUEUES } from '../queues';
import { enforceRateLimit } from '../ratelimit';
import { audit } from './audit';

// Discord role sync: members who connected their Discord account get the Discord roles that match
// their roles here, in the community's Discord server, through a Magnox bot.

const log = logger('discord');

/** Manage Roles: all the bot needs. */
const BOT_PERMISSIONS = 1n << 28n;
/** Linked members a full sync goes through, at most. */
const SYNC_MAX = 2000;

export function discordBotReady(): boolean {
  return Boolean(env().DISCORD_BOT_TOKEN);
}

/** Where an owner adds the Magnox bot to their Discord server (the bot's application id is the
 * same as the Discord sign-in client id). */
export function discordBotInviteUrl(guildId?: string): string | null {
  if (!discordBotReady() || !env().DISCORD_CLIENT_ID) return null;
  const q = new URLSearchParams({
    client_id: env().DISCORD_CLIENT_ID,
    scope: 'bot',
    permissions: String(BOT_PERMISSIONS),
    ...(guildId ? { guild_id: guildId, disable_guild_select: 'true' } : {}),
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export interface DiscordLinkView {
  botReady: boolean;
  inviteUrl: string | null;
  guildId: string | null;
  roleMap: Record<string, string>;
  lastSyncAt: string | null;
  lastSyncResult: string | null;
  /** This community's roles that can be mapped (not @everyone). */
  roles: { id: string; name: string; color: string | null }[];
}

export async function getDiscordLink(ctx: MemberContext): Promise<DiscordLinkView> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const [link, roles] = await Promise.all([
    db.query.discordLinks.findFirst({
      where: eq(schema.discordLinks.communityId, ctx.community.id),
    }),
    db
      .select({ id: schema.roles.id, name: schema.roles.name, color: schema.roles.color })
      .from(schema.roles)
      .where(and(eq(schema.roles.communityId, ctx.community.id), eq(schema.roles.isDefault, false)))
      .orderBy(schema.roles.position),
  ]);
  return {
    botReady: discordBotReady(),
    inviteUrl: discordBotInviteUrl(link?.guildId),
    guildId: link?.guildId ?? null,
    roleMap: link?.roleMap ?? {},
    lastSyncAt: link?.lastSyncAt?.toISOString() ?? null,
    lastSyncResult: link?.lastSyncResult ?? null,
    roles: roles.reverse(),
  };
}

/** Link the community's Discord server and say which roles match, then sync everyone. */
export async function saveDiscordLink(ctx: MemberContext, raw: unknown): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  if (!discordBotReady()) {
    throw new AppError('bad_request', 'Discord role sync isn’t set up on this site.');
  }
  const input = discordLinkSchema.parse(raw);
  const roleIds = Object.keys(input.roleMap);
  if (roleIds.length) {
    const ours = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(
        and(
          eq(schema.roles.communityId, ctx.community.id),
          eq(schema.roles.isDefault, false),
          inArray(schema.roles.id, roleIds),
        ),
      );
    if (ours.length !== roleIds.length) throw new AppError('validation', 'Unknown role.');
  }
  const values = { guildId: input.guildId, roleMap: input.roleMap, updatedAt: new Date() };
  await db
    .insert(schema.discordLinks)
    .values({ communityId: ctx.community.id, ...values })
    .onConflictDoUpdate({ target: schema.discordLinks.communityId, set: values });
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'discord.link',
    diff: { guildId: input.guildId, roles: roleIds.length },
  });
  if (roleIds.length)
    await enqueue(QUEUES.integrations, 'discord-sync', { communityId: ctx.community.id });
}

export async function removeDiscordLink(ctx: MemberContext): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  await db.delete(schema.discordLinks).where(eq(schema.discordLinks.communityId, ctx.community.id));
  await audit(db, { communityId: ctx.community.id, actorId: ctx.userId, action: 'discord.unlink' });
}

/** Go through every linked member now (also happens after saving). */
export async function syncDiscordNow(ctx: MemberContext): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const link = await db.query.discordLinks.findFirst({
    where: eq(schema.discordLinks.communityId, ctx.community.id),
  });
  if (!link) throw notFound('Discord link');
  await enforceRateLimit(`discord-sync:${ctx.community.id}`, 3, 600, 'Wait a few minutes.');
  await enqueue(QUEUES.integrations, 'discord-sync', { communityId: ctx.community.id });
}

/**
 * Someone's roles changed, or they joined or left: bring their Discord roles in line. Cheap when
 * the community has no Discord link, and never throws.
 */
export function queueDiscordMember(communityId: string, userId: string): void {
  void (async () => {
    if (!discordBotReady()) return;
    const link = await db.query.discordLinks.findFirst({
      where: eq(schema.discordLinks.communityId, communityId),
      columns: { roleMap: true },
    });
    if (!link || !Object.keys(link.roleMap).length) return;
    await enqueue(
      QUEUES.integrations,
      'discord-member',
      { communityId, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  })().catch((err: Error) => log.warn({ err: err.message }, 'discord sync not queued'));
}

// ── Talking to Discord (worker) ───────────────────────────────────────────

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Add or remove one Discord role. False when the person isn't in the Discord server. */
export async function setDiscordRole(
  guildId: string,
  discordUserId: string,
  discordRoleId: string,
  add: boolean,
): Promise<boolean> {
  const url = `${env().DISCORD_API_URL.replace(/\/$/, '')}/guilds/${guildId}/members/${discordUserId}/roles/${discordRoleId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: add ? 'PUT' : 'DELETE',
      headers: {
        authorization: `Bot ${env().DISCORD_BOT_TOKEN}`,
        'x-audit-log-reason': 'Magnox role sync',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 204 || res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number; code?: number };
    if (res.status === 429) {
      await sleep(Math.min(Number(body.retry_after ?? 1), 10) * 1000 + 100);
      continue;
    }
    // 10007 Unknown Member: they aren't in the Discord server (nothing to do).
    if (res.status === 404 && body.code === 10007) return false;
    if (res.status === 404 && body.code === 10011) {
      throw new DiscordError(`A matched Discord role (${discordRoleId}) no longer exists.`, 404);
    }
    if (res.status === 404 && body.code === 10004) {
      throw new DiscordError('The Magnox bot isn’t in that Discord server. Add it first.', 404);
    }
    if (res.status === 401) throw new DiscordError('The Discord bot token isn’t valid.', 401);
    if (res.status === 403) {
      throw new DiscordError(
        'The Magnox bot can’t manage those roles. Give it Manage Roles and drag its role above the roles it should give out.',
        403,
      );
    }
    throw new DiscordError(`Discord answered ${res.status}.`, res.status);
  }
  throw new DiscordError('Discord is rate limiting the bot. Try again later.', 429);
}

/** Discord user ids of people who connected Discord, by Magnox user id. */
async function discordIds(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ userId: schema.accounts.userId, accountId: schema.accounts.accountId })
    .from(schema.accounts)
    .where(
      and(eq(schema.accounts.providerId, 'discord'), inArray(schema.accounts.userId, userIds)),
    );
  return new Map(rows.map((r) => [r.userId, r.accountId]));
}

async function heldRoles(
  communityId: string,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!userIds.length) return out;
  const rows = await db
    .select({ userId: schema.memberRoles.userId, roleId: schema.memberRoles.roleId })
    .from(schema.memberRoles)
    .where(
      and(
        eq(schema.memberRoles.communityId, communityId),
        inArray(schema.memberRoles.userId, userIds),
      ),
    );
  for (const r of rows) {
    const set = out.get(r.userId) ?? new Set<string>();
    set.add(r.roleId);
    out.set(r.userId, set);
  }
  return out;
}

/** Bring one person's Discord roles in line with what they hold here. */
async function syncOne(
  guildId: string,
  roleMap: Record<string, string>,
  discordUserId: string,
  held: Set<string>,
): Promise<boolean> {
  let inGuild = true;
  for (const [roleId, discordRoleId] of Object.entries(roleMap)) {
    inGuild = await setDiscordRole(guildId, discordUserId, discordRoleId, held.has(roleId));
    if (!inGuild) break;
  }
  return inGuild;
}

/** Worker: one person changed (roles, joined, left). */
export async function syncDiscordMember(communityId: string, userId: string): Promise<void> {
  if (!discordBotReady()) return;
  const link = await db.query.discordLinks.findFirst({
    where: eq(schema.discordLinks.communityId, communityId),
  });
  if (!link || !Object.keys(link.roleMap).length) return;
  const discordUserId = (await discordIds([userId])).get(userId);
  if (!discordUserId) return;
  const member = await db.query.members.findFirst({
    where: and(eq(schema.members.communityId, communityId), eq(schema.members.userId, userId)),
    columns: { userId: true },
  });
  const held = member
    ? ((await heldRoles(communityId, [userId])).get(userId) ?? new Set())
    : new Set<string>();
  try {
    await syncOne(link.guildId, link.roleMap, discordUserId, held);
  } catch (e) {
    if (e instanceof DiscordError) {
      await db
        .update(schema.discordLinks)
        .set({ lastSyncResult: e.message })
        .where(eq(schema.discordLinks.communityId, communityId));
      // Retrying won't fix a setup problem.
      if (e.status !== 429) return;
    }
    throw e;
  }
}

/** Worker: go through every member who connected Discord. */
export async function syncDiscordCommunity(communityId: string): Promise<string> {
  if (!discordBotReady()) return 'not set up';
  const link = await db.query.discordLinks.findFirst({
    where: eq(schema.discordLinks.communityId, communityId),
  });
  if (!link) return 'no link';
  const linked = await db
    .select({ userId: schema.members.userId, accountId: schema.accounts.accountId })
    .from(schema.members)
    .innerJoin(
      schema.accounts,
      and(
        eq(schema.accounts.userId, schema.members.userId),
        eq(schema.accounts.providerId, 'discord'),
      ),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(and(eq(schema.members.communityId, communityId), isNull(schema.users.deletedAt)))
    .limit(SYNC_MAX);
  const held = await heldRoles(
    communityId,
    linked.map((l) => l.userId),
  );
  let synced = 0;
  let result: string;
  try {
    for (const l of linked) {
      if (await syncOne(link.guildId, link.roleMap, l.accountId, held.get(l.userId) ?? new Set())) {
        synced++;
      }
    }
    result =
      linked.length === 0
        ? 'No members have connected Discord yet.'
        : `Synced ${synced} of ${linked.length} members who connected Discord${synced < linked.length ? ' (the rest aren’t in the Discord server)' : ''}.`;
  } catch (e) {
    if (!(e instanceof DiscordError)) throw e;
    result = e.message;
  }
  await db
    .update(schema.discordLinks)
    .set({ lastSyncAt: new Date(), lastSyncResult: result })
    .where(eq(schema.discordLinks.communityId, communityId));
  return result;
}
