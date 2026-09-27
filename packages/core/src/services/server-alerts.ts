import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  formatDuration,
  Permission,
  serverIntegrationsSchema,
  type ServerAlertKind,
  type ServerAlertMeta,
} from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { AppError, notFound } from '../errors';
import { logger } from '../logger';
import { BlockedAddressError, resolveTarget, UnresolvableHostError } from '../net/ssrf';
import { audit } from './audit';
import { postSystemMessage } from './chat';

const log = logger('server-alerts');

/** Unverified listings whose server never answered are removed after this long. */
export const UNVERIFIED_TTL_MS = 48 * 3600_000;

// ── Alerts ─────────────────────────────────────────────────────────────────

export function alertText(kind: ServerAlertKind, meta: ServerAlertMeta): string {
  return kind === 'server_down'
    ? `${meta.serverName} is down. It stopped responding to status checks.`
    : `${meta.serverName} is back up${meta.downtimeMs ? ` after ${formatDuration(meta.downtimeMs)}` : ''}.`;
}

/**
 * Post a "down" or "back up" system message into the alert channel of every listing that points
 * at this endpoint. Channels must be chat channels in the listing's own community.
 */
export async function postServerAlerts(
  endpointId: string,
  kind: ServerAlertKind,
  info: { downtimeMs?: number } = {},
): Promise<number> {
  const rows = await db
    .select({
      serverId: schema.gameServers.id,
      serverName: schema.gameServers.name,
      communityId: schema.gameServers.communityId,
      channelId: schema.channels.id,
    })
    .from(schema.gameServers)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.gameServers.alertChannelId))
    .innerJoin(schema.communities, eq(schema.communities.id, schema.gameServers.communityId))
    .where(
      and(
        eq(schema.gameServers.endpointId, endpointId),
        isNull(schema.gameServers.deletedAt),
        eq(schema.channels.communityId, schema.gameServers.communityId),
        inArray(schema.channels.type, ['text', 'announcement']),
        isNull(schema.communities.deletedAt),
      ),
    );
  for (const r of rows) {
    const meta: ServerAlertMeta = {
      serverId: r.serverId,
      serverName: r.serverName,
      ...(info.downtimeMs ? { downtimeMs: info.downtimeMs } : {}),
    };
    try {
      await postSystemMessage(r.communityId!, r.channelId, {
        kind,
        text: alertText(kind, meta),
        meta,
      });
    } catch (err) {
      log.warn({ err: (err as Error).message, serverId: r.serverId }, 'alert not posted');
    }
  }
  return rows.length;
}

/**
 * Mark an endpoint down (after repeated failures). Only the first caller wins, so overlapping
 * polls never post the alert twice. Returns true when this call declared it down.
 */
export async function declareDown(endpointId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(schema.serverEndpoints)
    .set({ downSince: now })
    .where(
      and(
        eq(schema.serverEndpoints.id, endpointId),
        isNull(schema.serverEndpoints.downSince),
        // Never-reachable servers have nothing to be "down" from.
        isNotNull(schema.serverEndpoints.lastOnlineAt),
      ),
    )
    .returning({ id: schema.serverEndpoints.id });
  return rows.length > 0;
}

/** Clear the down flag. Returns true when this call cleared it (i.e. it was down). */
export async function declareUp(endpointId: string): Promise<boolean> {
  const rows = await db
    .update(schema.serverEndpoints)
    .set({ downSince: null })
    .where(
      and(eq(schema.serverEndpoints.id, endpointId), isNotNull(schema.serverEndpoints.downSince)),
    )
    .returning({ id: schema.serverEndpoints.id });
  return rows.length > 0;
}

// ── Integrations settings ──────────────────────────────────────────────────

export interface ServerIntegrationsView {
  alertChannelId: string | null;
  votifierHost: string | null;
  votifierPort: number | null;
  hasVotifierToken: boolean;
  hasVotifierKey: boolean;
  channels: { id: string; name: string }[];
}

async function loadListing(ctx: MemberContext, id: string) {
  const row = await db.query.gameServers.findFirst({
    where: and(
      eq(schema.gameServers.id, id),
      eq(schema.gameServers.communityId, ctx.community.id),
      isNull(schema.gameServers.deletedAt),
    ),
  });
  if (!row) throw notFound('Server');
  return row;
}

async function alertChannels(communityId: string) {
  return db
    .select({ id: schema.channels.id, name: schema.channels.name })
    .from(schema.channels)
    .where(
      and(
        eq(schema.channels.communityId, communityId),
        inArray(schema.channels.type, ['text', 'announcement']),
      ),
    )
    .orderBy(asc(schema.channels.position), asc(schema.channels.name));
}

export async function getServerIntegrations(
  ctx: MemberContext,
  id: string,
): Promise<ServerIntegrationsView> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const row = await loadListing(ctx, id);
  return {
    alertChannelId: row.alertChannelId,
    votifierHost: row.votifierHost,
    votifierPort: row.votifierPort,
    // Secrets never go back to the browser; the form only shows that one is saved.
    hasVotifierToken: Boolean(row.votifierToken),
    hasVotifierKey: Boolean(row.votifierPublicKey),
    channels: await alertChannels(ctx.community.id),
  };
}

/**
 * Save chat alerts and Votifier settings. A blank token or key keeps the saved one; clearing the
 * host removes Votifier entirely.
 */
export async function updateServerIntegrations(
  ctx: MemberContext,
  id: string,
  raw: unknown,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  const row = await loadListing(ctx, id);
  const input = serverIntegrationsSchema.parse(raw);

  if (input.alertChannelId) {
    const ok = (await alertChannels(ctx.community.id)).some((c) => c.id === input.alertChannelId);
    if (!ok) {
      throw new AppError('validation', 'Pick a chat channel in this community.', {
        fields: { alertChannelId: 'Not a chat channel here' },
      });
    }
  }

  let votifier = {
    votifierHost: null as string | null,
    votifierPort: null as number | null,
    votifierToken: null as string | null,
    votifierPublicKey: null as string | null,
  };
  if (input.votifierHost) {
    const port = input.votifierPort ?? 8192;
    try {
      await resolveTarget(input.votifierHost, port);
    } catch (e) {
      if (e instanceof BlockedAddressError || e instanceof UnresolvableHostError) {
        throw new AppError('validation', e.message, { fields: { votifierHost: e.message } });
      }
      throw e;
    }
    votifier = {
      votifierHost: input.votifierHost,
      votifierPort: port,
      votifierToken: input.votifierToken ?? (input.votifierPublicKey ? null : row.votifierToken),
      votifierPublicKey:
        input.votifierPublicKey ?? (input.votifierToken ? null : row.votifierPublicKey),
    };
    if (!votifier.votifierToken && !votifier.votifierPublicKey) {
      throw new AppError('validation', 'Add a NuVotifier token or a Votifier public key.', {
        fields: { votifierToken: 'Required' },
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.gameServers)
      .set({ alertChannelId: input.alertChannelId, ...votifier })
      .where(eq(schema.gameServers.id, row.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'server.integrations',
      targetType: 'server',
      targetId: row.id,
      diff: {
        alertChannelId: input.alertChannelId,
        votifierHost: votifier.votifierHost,
        votifierPort: votifier.votifierPort,
        votifier: votifier.votifierToken ? 'v2' : votifier.votifierPublicKey ? 'v1' : null,
      },
    });
  });
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove unverified listings whose server never answered a single status check within 48 hours
 * of being added. Keeps junk and scanning attempts out of the database.
 */
export async function cleanupUnverifiedServers(now = Date.now()): Promise<number> {
  const rows = await db
    .update(schema.gameServers)
    .set({ deletedAt: new Date(now) })
    .where(
      and(
        isNull(schema.gameServers.verifiedAt),
        isNull(schema.gameServers.deletedAt),
        lt(schema.gameServers.createdAt, new Date(now - UNVERIFIED_TTL_MS)),
        sql`exists (select 1 from server_endpoints e where e.id = ${schema.gameServers.endpointId} and e.last_online_at is null)`,
      ),
    )
    .returning({ id: schema.gameServers.id });
  if (rows.length) log.info({ n: rows.length }, 'removed unverified servers that never responded');
  return rows.length;
}
