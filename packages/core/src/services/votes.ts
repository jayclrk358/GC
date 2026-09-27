import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  formatDuration,
  MINECRAFT_NAME_RE,
  newId,
  Permission,
  VOTE_COOLDOWN_MS,
  voteInputSchema,
} from '@magnox/shared';
import { requirePerm, type MemberContext } from '../access';
import { AppError, notFound, unauthorized } from '../errors';
import { logger } from '../logger';
import { sendVotifierVote } from '../net/votifier';
import { verifyTurnstile } from '../net/turnstile';
import { enqueue, QUEUES } from '../queues';
import { enforceRateLimit } from '../ratelimit';

const log = logger('votes');

export const VOTIFIER_SERVICE = 'Magnox';
export const VOTIFIER_ATTEMPTS = 3;

export interface VoteStatus {
  /** When the viewer last voted for this server, if within the cooldown. */
  lastVoteAt: string | null;
  /** When the viewer can vote again (null: now). */
  nextVoteAt: string | null;
}

export async function voteStatus(
  userId: string | null,
  serverId: string,
  now = Date.now(),
): Promise<VoteStatus> {
  if (!userId) return { lastVoteAt: null, nextVoteAt: null };
  const [last] = await db
    .select({ createdAt: schema.serverVotes.createdAt })
    .from(schema.serverVotes)
    .where(and(eq(schema.serverVotes.userId, userId), eq(schema.serverVotes.serverId, serverId)))
    .orderBy(desc(schema.serverVotes.createdAt))
    .limit(1);
  if (!last) return { lastVoteAt: null, nextVoteAt: null };
  const next = last.createdAt.getTime() + VOTE_COOLDOWN_MS;
  return next > now
    ? { lastVoteAt: last.createdAt.toISOString(), nextVoteAt: new Date(next).toISOString() }
    : { lastVoteAt: null, nextVoteAt: null };
}

export interface VoteResult {
  voteCount: number;
  nextVoteAt: string;
  /** A reward is on its way to the game server (Votifier). */
  rewardQueued: boolean;
}

/**
 * Vote for a listed, verified server: once per 24 hours per account, verified email required,
 * plus a Turnstile check when configured. Minecraft servers with Votifier set up get a callback
 * so the player can be rewarded in game.
 */
export async function castVote(
  userId: string | null,
  serverId: string,
  raw: unknown,
  meta: { ip?: string } = {},
): Promise<VoteResult> {
  if (!userId) throw unauthorized();
  const input = voteInputSchema.parse(raw);
  const [user, server] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    db
      .select({
        id: schema.gameServers.id,
        protocol: schema.serverEndpoints.protocol,
        votifierHost: schema.gameServers.votifierHost,
        votifierToken: schema.gameServers.votifierToken,
        votifierPublicKey: schema.gameServers.votifierPublicKey,
      })
      .from(schema.gameServers)
      .innerJoin(
        schema.serverEndpoints,
        eq(schema.serverEndpoints.id, schema.gameServers.endpointId),
      )
      .where(
        and(
          eq(schema.gameServers.id, serverId),
          eq(schema.gameServers.listed, true),
          isNotNull(schema.gameServers.verifiedAt),
          isNull(schema.gameServers.deletedAt),
        ),
      )
      .limit(1)
      .then((r) => r[0]),
  ]);
  if (!user) throw unauthorized();
  if (!server) throw notFound('Server');
  if (!user.emailVerified) {
    throw new AppError('forbidden', 'Verify your email address before voting.');
  }

  const rewards =
    server.protocol === 'minecraft' &&
    Boolean(server.votifierHost && (server.votifierToken || server.votifierPublicKey));
  const username = rewards ? input.username : undefined;
  if (username && !MINECRAFT_NAME_RE.test(username)) {
    throw new AppError('validation', 'Enter your Minecraft username.', {
      fields: { username: 'Use 3-16 letters, numbers or underscores' },
    });
  }
  if (meta.ip) await enforceRateLimit(`vote-ip:${meta.ip}`, 30, 3600);
  if (!(await verifyTurnstile(input.turnstileToken, meta.ip))) {
    throw new AppError('validation', 'Please complete the check to show you are human.', {
      fields: { turnstile: 'Required' },
    });
  }

  const now = new Date();
  const voteId = newId();
  const count = await db.transaction(async (tx) => {
    // Serialise votes by the same person for the same server, so double clicks can't both count.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${serverId}`}, 0))`,
    );
    const [last] = await tx
      .select({ createdAt: schema.serverVotes.createdAt })
      .from(schema.serverVotes)
      .where(and(eq(schema.serverVotes.userId, userId), eq(schema.serverVotes.serverId, serverId)))
      .orderBy(desc(schema.serverVotes.createdAt))
      .limit(1);
    const wait = last ? last.createdAt.getTime() + VOTE_COOLDOWN_MS - now.getTime() : 0;
    if (wait > 0) {
      throw new AppError(
        'rate_limited',
        `You've already voted for this server. You can vote again in ${formatDuration(wait)}.`,
        { retryAfter: Math.ceil(wait / 1000) },
      );
    }
    await tx.insert(schema.serverVotes).values({
      id: voteId,
      serverId,
      userId,
      username: username ?? null,
      reward: username ? 'pending' : null,
      createdAt: now,
    });
    const [row] = await tx
      .update(schema.gameServers)
      .set({ voteCount: sql`${schema.gameServers.voteCount} + 1` })
      .where(eq(schema.gameServers.id, serverId))
      .returning({ voteCount: schema.gameServers.voteCount });
    return row?.voteCount ?? 0;
  });

  if (username) {
    await enqueue(
      QUEUES.integrations,
      'votifier',
      { voteId, address: meta.ip ?? '127.0.0.1' },
      { attempts: VOTIFIER_ATTEMPTS, backoff: { type: 'exponential', delay: 15_000 } },
    );
  }
  return {
    voteCount: count,
    nextVoteAt: new Date(now.getTime() + VOTE_COOLDOWN_MS).toISOString(),
    rewardQueued: Boolean(username),
  };
}

/** Worker: deliver a vote to the game server. Throws to let the queue retry. */
export async function deliverVotifierVote(
  voteId: string,
  address: string,
  finalAttempt: boolean,
): Promise<'sent' | 'failed' | 'skipped'> {
  const [row] = await db
    .select({
      reward: schema.serverVotes.reward,
      username: schema.serverVotes.username,
      createdAt: schema.serverVotes.createdAt,
      host: schema.gameServers.votifierHost,
      port: schema.gameServers.votifierPort,
      token: schema.gameServers.votifierToken,
      publicKey: schema.gameServers.votifierPublicKey,
    })
    .from(schema.serverVotes)
    .innerJoin(schema.gameServers, eq(schema.gameServers.id, schema.serverVotes.serverId))
    .where(eq(schema.serverVotes.id, voteId))
    .limit(1);
  if (!row || row.reward !== 'pending' || !row.username) return 'skipped';
  if (!row.host || (!row.token && !row.publicKey)) {
    await setReward(voteId, 'failed');
    return 'failed';
  }
  try {
    await sendVotifierVote(
      { host: row.host, port: row.port ?? 8192, token: row.token, publicKey: row.publicKey },
      {
        serviceName: VOTIFIER_SERVICE,
        username: row.username,
        address,
        timestamp: row.createdAt.getTime(),
      },
    );
  } catch (err) {
    log.info({ voteId, err: (err as Error).message }, 'votifier delivery failed');
    if (finalAttempt) {
      await setReward(voteId, 'failed');
      return 'failed';
    }
    throw err;
  }
  await setReward(voteId, 'sent');
  return 'sent';
}

async function setReward(voteId: string, reward: 'sent' | 'failed') {
  await db.update(schema.serverVotes).set({ reward }).where(eq(schema.serverVotes.id, voteId));
}

/** Settings: send a test vote with the saved Votifier details. */
export async function sendTestVote(
  ctx: MemberContext,
  serverId: string,
  username: string,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_SERVERS);
  if (!MINECRAFT_NAME_RE.test(username)) {
    throw new AppError('validation', 'Enter a Minecraft username to receive the test vote.', {
      fields: { username: 'Use 3-16 letters, numbers or underscores' },
    });
  }
  const server = await db.query.gameServers.findFirst({
    where: and(
      eq(schema.gameServers.id, serverId),
      eq(schema.gameServers.communityId, ctx.community.id),
      isNull(schema.gameServers.deletedAt),
    ),
  });
  if (!server) throw notFound('Server');
  if (!server.votifierHost || (!server.votifierToken && !server.votifierPublicKey)) {
    throw new AppError('validation', 'Save your Votifier details first.');
  }
  await enforceRateLimit(`votifier-test:${ctx.userId}`, 10, 600);
  try {
    await sendVotifierVote(
      {
        host: server.votifierHost,
        port: server.votifierPort ?? 8192,
        token: server.votifierToken,
        publicKey: server.votifierPublicKey,
      },
      { serviceName: VOTIFIER_SERVICE, username, address: '127.0.0.1', timestamp: Date.now() },
    );
  } catch {
    // Generic on purpose: detailed network errors would make this a port scanner.
    throw new AppError(
      'validation',
      "Couldn't deliver the test vote. Check the host, port and token or key, and that Votifier is running.",
    );
  }
}
