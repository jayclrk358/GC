import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { apiTokenInputSchema, newId, type ApiScope } from '@gamecentral/shared';
import { AppError, notFound, unauthorized } from '../errors';
import { enforceRateLimit, rateLimit } from '../ratelimit';

// Personal API tokens: the public API acts as the person who made the token, with their access.

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const MAX_TOKENS = 20;
/** Requests a minute for one token, and for one person across all their tokens. */
const PER_TOKEN_PER_MINUTE = 120;
const PER_USER_PER_MINUTE = 300;

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listApiTokens(userId: string | null): Promise<ApiTokenView[]> {
  if (!userId) throw unauthorized();
  const rows = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .orderBy(desc(schema.apiTokens.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Make a token. The token itself is returned this once; only its hash is kept. */
export async function createApiToken(
  userId: string | null,
  raw: unknown,
): Promise<{ token: string; view: ApiTokenView }> {
  if (!userId) throw unauthorized();
  // Deleting and making tokens again mustn't hand out fresh rate-limit buckets.
  await enforceRateLimit(
    `api-token-create:${userId}`,
    10,
    3600,
    'You are making tokens too quickly. Try again later.',
  );
  const input = apiTokenInputSchema.parse(raw);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId));
  if ((count?.n ?? 0) >= MAX_TOKENS) {
    throw new AppError('conflict', `You can have up to ${MAX_TOKENS} tokens. Delete one first.`);
  }
  const token = `mx_${randomBytes(24).toString('base64url')}`;
  const scopes: ApiScope[] = input.write ? ['read', 'write'] : ['read'];
  const row = {
    id: newId(),
    userId,
    name: input.name,
    tokenHash: hash(token),
    prefix: token.slice(0, 9),
    scopes,
    createdAt: new Date(),
  };
  await db.insert(schema.apiTokens).values(row);
  return {
    token,
    view: {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes,
      lastUsedAt: null,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export async function revokeApiToken(userId: string | null, id: string): Promise<void> {
  if (!userId) throw unauthorized();
  const removed = await db
    .delete(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId)))
    .returning({ id: schema.apiTokens.id });
  if (!removed.length) throw notFound('Token');
}

export interface ApiCaller {
  userId: string;
  tokenId: string;
  scopes: string[];
}

/**
 * Who an `Authorization: Bearer mx_…` header belongs to, or an error. Each token gets 120
 * requests a minute, and each person 300 a minute across all their tokens.
 */
export async function authenticateApiToken(header: string | null): Promise<ApiCaller> {
  const token = header?.match(/^Bearer\s+(mx_[\w-]{20,64})$/i)?.[1];
  if (!token) {
    throw new AppError('unauthorized', 'Send an API token: Authorization: Bearer mx_…');
  }
  const row = await db.query.apiTokens.findFirst({
    where: eq(schema.apiTokens.tokenHash, hash(token)),
  });
  if (!row)
    throw new AppError('unauthorized', 'That API token isn’t valid (it may have been deleted).');
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, row.userId),
    columns: { banned: true, deletedAt: true },
  });
  if (!user || user.banned || user.deletedAt)
    throw new AppError('unauthorized', 'This account can’t use the API.');
  const limit = await rateLimit(`api:${row.id}`, PER_TOKEN_PER_MINUTE, 60);
  if (!limit.ok) {
    throw new AppError(
      'rate_limited',
      `Too many requests: up to ${PER_TOKEN_PER_MINUTE} a minute per token.`,
      { retryAfter: limit.resetIn },
    );
  }
  // Summed across the person's tokens, so making more of them doesn't raise the ceiling.
  const userLimit = await rateLimit(`api-user:${row.userId}`, PER_USER_PER_MINUTE, 60);
  if (!userLimit.ok) {
    throw new AppError(
      'rate_limited',
      `Too many requests: up to ${PER_USER_PER_MINUTE} a minute across all your tokens.`,
      { retryAfter: userLimit.resetIn },
    );
  }
  // Note when it was last used (not on every request).
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db
      .update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, row.id));
  }
  return { userId: row.userId, tokenId: row.id, scopes: row.scopes };
}
