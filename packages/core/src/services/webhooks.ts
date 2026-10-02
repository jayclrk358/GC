import { createHmac, randomBytes } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  formatDuration,
  isDiscordWebhookUrl,
  newId,
  Permission,
  SIGNATURE_HEADER,
  webhookInputSchema,
  type WebhookEvent,
} from '@magnox/shared';
import { everyoneCanView, requirePerm, type MemberContext } from '../access';
import { cached, uncache } from '../cache';
import { env } from '../env';
import { AppError, notFound } from '../errors';
import { logger } from '../logger';
import { BlockedAddressError, resolveTarget, UnresolvableHostError } from '../net/ssrf';
import { safePost } from '../net/safe-fetch';
import { enqueue, QUEUES } from '../queues';
import { enforceRateLimit, rateLimit } from '../ratelimit';
import { cacheRedis } from '../redis';
import { audit } from './audit';

// Webhooks: a community sends news of what happens in it to other places, either as signed JSON
// to its own code or as messages in a Discord channel.

const log = logger('webhooks');

const MAX_WEBHOOKS = 10;
/** Failed deliveries in a row before a webhook is switched off. */
export const WEBHOOK_MAX_FAILURES = 20;
const USER_AGENT = 'MagnoxWebhooks/1.0 (+https://magnoxresources.com/developers)';
/** Most deliveries a community can queue in a minute, across its webhooks; the rest are dropped. */
const DELIVERIES_PER_MINUTE = 600;
/** A burst of chat messages goes to a Discord webhook together, at most this often. */
const BATCH_MS = 2000;
/** Most messages in one batch (more in the same two seconds are dropped). */
const MAX_BATCH = 10;
const RETRIES = { attempts: 5, backoff: { type: 'exponential', delay: 15_000 } } as const;

export interface WebhookView {
  id: string;
  name: string;
  kind: 'json' | 'discord';
  /** The address with anything secret in it hidden. */
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
  failures: number;
  createdAt: string;
}

/** What a delivery carries, for both kinds. */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent | 'ping';
  occurredAt: string;
  community: { id: string; slug: string; name: string; url: string };
  data: Record<string, unknown>;
}

/** Hide the token in a Discord webhook address, and any query string. */
export function maskWebhookUrl(raw: string): string {
  try {
    const u = new URL(raw);
    let path = u.pathname;
    if (isDiscordWebhookUrl(raw)) path = path.replace(/\/[\w-]+$/, '/••••');
    return `${u.protocol}//${u.host}${path}${u.search ? '?…' : ''}`;
  } catch {
    return '';
  }
}

function toView(r: typeof schema.webhooks.$inferSelect): WebhookView {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    url: maskWebhookUrl(r.url),
    events: r.events,
    active: r.active,
    lastStatus: r.lastStatus,
    lastError: r.lastError,
    lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
    failures: r.failures,
    createdAt: r.createdAt.toISOString(),
  };
}

const hooksKey = (communityId: string) => `webhooks:${communityId}`;
async function forgetHooks(communityId: string) {
  await uncache(hooksKey(communityId));
}

export async function listWebhooks(ctx: MemberContext): Promise<WebhookView[]> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const rows = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.communityId, ctx.community.id))
    .orderBy(asc(schema.webhooks.createdAt));
  return rows.map(toView);
}

/** Check an address can be sent to: public, on a web port, https outside tests. */
async function checkUrl(raw: string): Promise<void> {
  const allowPrivate = env().SERVER_QUERY_ALLOW_PRIVATE;
  const fail = (message: string) =>
    new AppError('validation', message, { fields: { url: message } });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw fail('Enter a full address, starting with https://');
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw fail('Use an https:// address.');
  }
  if (url.username || url.password) throw fail('Leave the username and password out.');
  if (url.port && url.port !== '443' && !allowPrivate) throw fail('Use the standard https port.');
  try {
    await resolveTarget(url.hostname.replace(/^\[|\]$/g, ''), Number(url.port || 443), {
      allowPrivate,
    });
  } catch (e) {
    if (e instanceof BlockedAddressError || e instanceof UnresolvableHostError) {
      throw fail(e.message);
    }
    throw e;
  }
}

/** Add a webhook. For JSON webhooks the signing secret is returned this once. */
export async function createWebhook(
  ctx: MemberContext,
  raw: unknown,
): Promise<{ view: WebhookView; secret: string | null }> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const input = webhookInputSchema.parse(raw);
  await checkUrl(input.url);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.webhooks)
    .where(eq(schema.webhooks.communityId, ctx.community.id));
  if ((count?.n ?? 0) >= MAX_WEBHOOKS) {
    throw new AppError('conflict', `A community can have up to ${MAX_WEBHOOKS} webhooks.`);
  }
  const kind = isDiscordWebhookUrl(input.url) ? 'discord' : 'json';
  const secret = `whsec_${randomBytes(24).toString('base64url')}`;
  const [row] = await db
    .insert(schema.webhooks)
    .values({
      id: newId(),
      communityId: ctx.community.id,
      name: input.name,
      url: input.url.trim(),
      kind,
      events: [...new Set(input.events)],
      secret,
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'webhook.create',
    targetType: 'webhook',
    targetId: row!.id,
    diff: { name: input.name, kind, events: input.events },
  });
  await forgetHooks(ctx.community.id);
  return { view: toView(row!), secret: kind === 'json' ? secret : null };
}

async function loadHook(ctx: MemberContext, id: string) {
  const row = await db.query.webhooks.findFirst({
    where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.communityId, ctx.community.id)),
  });
  if (!row) throw notFound('Webhook');
  return row;
}

/** Switch a webhook on or off. Switching it back on clears its failure count. */
export async function setWebhookActive(
  ctx: MemberContext,
  id: string,
  active: boolean,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  // Switching back on starts the failure count again, so it can't be done over and over.
  if (active) {
    await enforceRateLimit(
      `webhook-enable:${ctx.community.id}`,
      10,
      3600,
      'Webhooks have been switched back on a lot lately. Try again later.',
    );
  }
  const row = await loadHook(ctx, id);
  await db
    .update(schema.webhooks)
    .set(active ? { active: true, failures: 0 } : { active: false })
    .where(eq(schema.webhooks.id, row.id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'webhook.update',
    targetType: 'webhook',
    targetId: row.id,
    diff: { active },
  });
  await forgetHooks(ctx.community.id);
}

export async function deleteWebhook(ctx: MemberContext, id: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  const row = await loadHook(ctx, id);
  await db.delete(schema.webhooks).where(eq(schema.webhooks.id, row.id));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: 'webhook.delete',
    targetType: 'webhook',
    targetId: row.id,
    diff: { name: row.name },
  });
  await forgetHooks(ctx.community.id);
}

const appUrl = () => env().APP_URL.replace(/\/$/, '');

function communityInfo(c: { id: string; slug: string; name: string }) {
  return { id: c.id, slug: c.slug, name: c.name, url: `${appUrl()}/c/${c.slug}` };
}

/** Send a test delivery now, and say how it went. */
export async function testWebhook(
  ctx: MemberContext,
  id: string,
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  requirePerm(ctx, Permission.MANAGE_COMMUNITY);
  await enforceRateLimit(
    `webhook-test:${ctx.community.id}`,
    10,
    60,
    'Wait a minute between tests.',
  );
  const row = await loadHook(ctx, id);
  const payload: WebhookPayload = {
    id: newId(),
    event: 'ping',
    occurredAt: new Date().toISOString(),
    community: communityInfo(ctx.community),
    data: {},
  };
  const result = await send(row, [payload]);
  await record(row.id, result, true);
  return { ok: result.ok, status: result.status, error: result.error };
}

// ── Sending ────────────────────────────────────────────────────────────────

/** The HMAC a JSON delivery is signed with: hex SHA-256 over `timestamp.body`. */
export function webhookSignature(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

const clip = (text: unknown, max: number) => {
  const s = typeof text === 'string' ? text : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

type Person = { name?: string; url?: string };
type Named = { name?: string; title?: string; url?: string };

const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x6366f1;
const AMBER = 0xf59e0b;

/**
 * Text people wrote, as Discord should show it: as typed, not as Markdown, masked links or
 * mentions (`**bold**`, `[text](url)`, `<@id>`, `@everyone`). For the parts Discord formats
 * (titles, descriptions, field values); the author line and footer are shown as they are.
 */
export function discordText(text: unknown): string {
  return (typeof text === 'string' ? text : '').replace(/[\\*_~`|>[\]()@<#]/g, '\\$&');
}

/** How a delivery reads as a Discord message. Nobody is ever pinged by it. */
export function discordMessage(p: WebhookPayload): Record<string, unknown> {
  const d = p.data;
  const user = (d.user ?? d.author ?? {}) as Person;
  const channel = (d.channel ?? {}) as Named;
  const embed: Record<string, unknown> = {
    footer: { text: clip(p.community.name, 200) },
    timestamp: p.occurredAt,
  };
  const by = user.name ? { author: { name: clip(user.name, 200), url: user.url } } : {};
  const who = discordText(user.name);
  switch (p.event) {
    case 'ping':
      Object.assign(embed, {
        title: 'Connected to Magnox',
        description: clip(`News from ${discordText(p.community.name)} will show up here.`, 400),
        url: p.community.url,
        color: BLUE,
      });
      break;
    case 'member.joined':
      Object.assign(embed, {
        title: clip(`${who} joined`, 250),
        url: user.url,
        color: GREEN,
      });
      break;
    case 'member.left':
      Object.assign(embed, {
        title: clip(
          `${who} ${d.reason === 'kicked' || d.reason === 'banned' ? 'was removed' : 'left'}`,
          250,
        ),
        url: user.url,
        color: AMBER,
      });
      break;
    case 'message.created':
    case 'announcement.created': {
      const m = (d.message ?? {}) as { content?: string; url?: string };
      Object.assign(embed, by, {
        title: clip(
          `${p.event === 'announcement.created' ? 'Announcement' : 'New message'} in #${discordText(channel.name)}`,
          250,
        ),
        description: clip(discordText(m.content), 1500),
        url: m.url,
        color: p.event === 'announcement.created' ? AMBER : BLUE,
      });
      break;
    }
    case 'thread.created': {
      const t = (d.thread ?? {}) as { title?: string; excerpt?: string; url?: string };
      Object.assign(embed, by, {
        title: clip(discordText(t.title), 250),
        description: clip(discordText(t.excerpt), 1000),
        url: t.url,
        color: BLUE,
        fields: [{ name: 'Forum', value: clip(discordText(channel.name), 100), inline: true }],
      });
      break;
    }
    case 'post.created': {
      const t = (d.thread ?? {}) as { title?: string };
      const post = (d.post ?? {}) as { excerpt?: string; url?: string };
      Object.assign(embed, by, {
        title: clip(`Reply: ${discordText(t.title)}`, 250),
        description: clip(discordText(post.excerpt), 1000),
        url: post.url,
        color: BLUE,
      });
      break;
    }
    case 'event.created': {
      const e = (d.event ?? {}) as { title?: string; when?: string; url?: string };
      Object.assign(embed, by, {
        title: clip(`New event: ${discordText(e.title)}`, 250),
        description: clip(discordText(e.when), 300),
        url: e.url,
        color: AMBER,
      });
      break;
    }
    case 'application.submitted':
      Object.assign(embed, {
        title: clip(`${who} applied to join`, 250),
        url: (d.reviewUrl as string) ?? p.community.url,
        color: BLUE,
      });
      break;
    case 'server.down':
    case 'server.up': {
      const s = (d.server ?? {}) as { name?: string; url?: string };
      const name = discordText(s.name);
      const down = p.event === 'server.down';
      const after =
        !down && typeof d.downtimeMs === 'number' && d.downtimeMs > 0
          ? ` after ${formatDuration(d.downtimeMs)}`
          : '';
      Object.assign(embed, {
        title: clip(down ? `${name} is down` : `${name} is back up${after}`, 250),
        url: s.url,
        color: down ? RED : GREEN,
      });
      break;
    }
  }
  return {
    username: 'Magnox',
    avatar_url: `${appUrl()}/icons/icon-192.png`,
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };
}

/** Several chat messages as one Discord message: a line each, under one heading. */
export function discordBatchMessage(payloads: WebhookPayload[]): Record<string, unknown> {
  const last = payloads[payloads.length - 1]!;
  const message = discordMessage(last);
  if (payloads.length === 1) return message;
  const channels = new Set(payloads.map((p) => (p.data.channel as Named | undefined)?.name));
  const lines = payloads.map((p) => {
    const author = (p.data.author ?? {}) as Person;
    const channel = (p.data.channel ?? {}) as Named;
    const m = (p.data.message ?? {}) as { content?: string };
    const where = channels.size > 1 ? ` in #${discordText(channel.name)}` : '';
    return `**${discordText(author.name ?? 'Someone')}**${where}: ${clip(discordText(m.content), 300)}`;
  });
  const [embed] = message.embeds as Record<string, unknown>[];
  const only = channels.size === 1 ? ` in #${discordText([...channels][0])}` : '';
  const { author: _author, ...rest } = embed!;
  return {
    ...message,
    embeds: [
      {
        ...rest,
        title: clip(`${payloads.length} new messages${only}`, 250),
        description: clip(lines.join('\n'), 4000),
      },
    ],
  };
}

interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  /** Worth trying again later (network trouble, 5xx, rate limited). */
  retry: boolean;
}

/** Send one delivery (several chat messages at once only to Discord, as one message). */
async function send(
  hook: { url: string; kind: string; secret: string },
  payloads: WebhookPayload[],
): Promise<SendResult> {
  const payload = payloads[0]!;
  const body = JSON.stringify(hook.kind === 'discord' ? discordBatchMessage(payloads) : payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (hook.kind === 'json') {
    Object.assign(headers, {
      'x-magnox-event': payload.event,
      'x-magnox-delivery': payload.id,
      'x-magnox-timestamp': timestamp,
      [SIGNATURE_HEADER]: webhookSignature(hook.secret, timestamp, body),
    });
  }
  try {
    const res = await safePost(hook.url, body, headers, { userAgent: USER_AGENT });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, error: null, retry: false };
    }
    const retry = res.status === 408 || res.status === 429 || res.status >= 500;
    const error =
      res.status >= 300 && res.status < 400
        ? 'The address redirected (redirects aren’t followed).'
        : `The address answered ${res.status}.`;
    return { ok: false, status: res.status, error, retry };
  } catch (e) {
    const error =
      e instanceof BlockedAddressError || e instanceof UnresolvableHostError
        ? e.message
        : `Couldn’t connect (${clip((e as Error).message, 80)}).`;
    return { ok: false, status: null, error, retry: true };
  }
}

/**
 * Note how a delivery went. A failure counts when it's the last try, when trying again won't help,
 * or when the address timed out or couldn't be reached at all: each of those ties up a worker,
 * so an address that's gone is switched off soon rather than after a hundred tries.
 */
async function record(id: string, r: SendResult, final: boolean) {
  if (r.ok) {
    await db
      .update(schema.webhooks)
      .set({ lastStatus: r.status, lastError: null, lastDeliveredAt: new Date(), failures: 0 })
      .where(eq(schema.webhooks.id, id));
    return;
  }
  const counts = final || !r.retry || r.status === null;
  const [row] = await db
    .update(schema.webhooks)
    .set({
      lastStatus: r.status,
      lastError: r.error,
      ...(counts ? { failures: sql`${schema.webhooks.failures} + 1` } : {}),
    })
    .where(eq(schema.webhooks.id, id))
    .returning({ failures: schema.webhooks.failures, communityId: schema.webhooks.communityId });
  if (row && row.failures >= WEBHOOK_MAX_FAILURES) {
    await db.update(schema.webhooks).set({ active: false }).where(eq(schema.webhooks.id, id));
    await forgetHooks(row.communityId);
    log.info({ webhookId: id }, 'webhook switched off after repeated failures');
  }
}

export interface WebhookJob {
  webhookId: string;
  /** What to send; a batch of chat messages for Discord waits in Redis instead. */
  payload?: WebhookPayload;
  batch?: boolean;
}

// Chat messages for a Discord webhook wait in a short list; the first opens a job that sends them
// together two seconds later, so a busy channel makes one delivery every two seconds, not one per
// message (Discord would turn most of those away).
const batchKey = (webhookId: string) => `webhook-batch:${webhookId}`;
/** Long enough to outlast the retries of the job that sends them. */
const BATCH_TTL_SECONDS = 600;

/** Add a message to a webhook's batch. True when it starts a batch, which then needs a job. */
async function addToBatch(webhookId: string, payload: WebhookPayload): Promise<boolean> {
  const key = batchKey(webhookId);
  const redis = cacheRedis();
  await redis
    .multi()
    .rpush(key, JSON.stringify(payload))
    // A burst beyond what one delivery holds is dropped (the oldest are kept).
    .ltrim(key, 0, MAX_BATCH - 1)
    .expire(key, BATCH_TTL_SECONDS)
    .exec();
  return (await redis.set(`${key}:open`, '1', 'PX', BATCH_MS, 'NX')) === 'OK';
}

async function takeBatch(webhookId: string): Promise<WebhookPayload[]> {
  const key = batchKey(webhookId);
  const [[, items]] = (await cacheRedis().multi().lrange(key, 0, -1).del(key).exec()) as [
    [null, string[]],
    [null, number],
  ];
  return items.flatMap((s) => {
    try {
      return [JSON.parse(s) as WebhookPayload];
    } catch {
      return [];
    }
  });
}

/** Put a batch that failed back at the front, for the next try (this job's or a newer one's). */
async function returnBatch(webhookId: string, payloads: WebhookPayload[]): Promise<void> {
  const key = batchKey(webhookId);
  await cacheRedis()
    .multi()
    .lpush(key, ...payloads.map((p) => JSON.stringify(p)).reverse())
    .ltrim(key, 0, MAX_BATCH - 1)
    .expire(key, BATCH_TTL_SECONDS)
    .exec();
}

/**
 * Deliver one webhook (worker job). Returns "retry" when it should be tried again, which the
 * worker turns into a BullMQ retry; `final` is the last try.
 */
export async function deliverWebhook(
  job: WebhookJob,
  final: boolean,
): Promise<'sent' | 'skipped' | 'failed' | 'retry'> {
  const hook = await db.query.webhooks.findFirst({ where: eq(schema.webhooks.id, job.webhookId) });
  if (!hook || !hook.active) return 'skipped';
  const payloads = job.batch ? await takeBatch(hook.id) : job.payload ? [job.payload] : [];
  if (!payloads.length) return 'skipped';
  const r = await send(hook, payloads);
  await record(hook.id, r, final);
  if (r.ok) return 'sent';
  if (r.retry && !final) {
    if (job.batch) await returnBatch(hook.id, payloads);
    return 'retry';
  }
  return 'failed';
}

// ── Emitting ───────────────────────────────────────────────────────────────

/** A community's active webhooks and what each wants, kept for a minute. */
function activeHooks(communityId: string) {
  return cached(hooksKey(communityId), 60, async () =>
    db
      .select({
        id: schema.webhooks.id,
        events: schema.webhooks.events,
        kind: schema.webhooks.kind,
      })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.communityId, communityId), eq(schema.webhooks.active, true))),
  );
}

/**
 * Whether another delivery fits in the community's budget for this minute. Past it, deliveries
 * are dropped (and that's logged once a minute), so one busy or abusive community can't fill the
 * queue for everyone.
 */
async function withinBudget(communityId: string, event: WebhookEvent): Promise<boolean> {
  const r = await rateLimit(`webhook-budget:${communityId}`, DELIVERIES_PER_MINUTE, 60);
  if (r.ok) return true;
  const first = await cacheRedis().set(`webhook-budget-noted:${communityId}`, '1', 'EX', 60, 'NX');
  if (first) {
    log.warn(
      { communityId, event, perMinute: DELIVERIES_PER_MINUTE },
      'webhook deliveries over budget; dropping them for the rest of the minute',
    );
  }
  return false;
}

/**
 * Tell a community's webhooks that something happened. `data` is only worked out when a webhook
 * wants the event; returning null skips it (e.g. a channel that isn't open to everyone). Never
 * throws: webhooks must not get in the way of what triggered them.
 */
export function emitWebhook(
  communityId: string,
  event: WebhookEvent,
  data: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
): void {
  void (async () => {
    const hooks = (await activeHooks(communityId)).filter((h) => h.events.includes(event));
    if (!hooks.length) return;
    const [payloadData, community] = await Promise.all([
      data(),
      db.query.communities.findFirst({
        where: eq(schema.communities.id, communityId),
        columns: { id: true, slug: true, name: true },
      }),
    ]);
    if (!payloadData || !community) return;
    const payload: WebhookPayload = {
      id: newId(),
      event,
      occurredAt: new Date().toISOString(),
      community: communityInfo(community),
      data: payloadData,
    };
    for (const h of hooks) {
      if (event === 'message.created' && h.kind === 'discord') {
        // Joins the batch already on its way, if there is one.
        if (!(await addToBatch(h.id, payload))) continue;
        if (!(await withinBudget(communityId, event))) continue;
        const job: WebhookJob = { webhookId: h.id, batch: true };
        await enqueue(QUEUES.webhooks, 'webhook', job, { ...RETRIES, delay: BATCH_MS });
        continue;
      }
      if (!(await withinBudget(communityId, event))) continue;
      const job: WebhookJob = { webhookId: h.id, payload };
      await enqueue(QUEUES.webhooks, 'webhook', job, RETRIES);
    }
  })().catch((err: Error) => log.warn({ err: err.message, event }, 'webhook not queued'));
}

// ── Payload helpers for the places that emit ───────────────────────────────

/** A person as webhooks describe them. */
export async function webhookUser(userId: string) {
  const u = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, username: true },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    url: u.username ? `${appUrl()}/u/${u.username}` : undefined,
  };
}

/** A link into the site. */
export function siteUrl(path: string): string {
  return `${appUrl()}${path}`;
}

/** Shortcut for member.joined and member.left. */
export function emitMemberEvent(
  communityId: string,
  userId: string,
  event: 'member.joined' | 'member.left',
  reason?: 'left' | 'kicked' | 'banned',
): void {
  emitWebhook(communityId, event, async () => {
    const user = await webhookUser(userId);
    return user ? { user, ...(reason ? { reason } : {}) } : null;
  });
}

/** Clip text for a payload. */
export function webhookExcerpt(text: string, max = 500): string {
  return clip(text.replace(/\s+/g, ' ').trim(), max);
}

/**
 * A content event (message, thread, reply). These only go out for channels everyone in the
 * community can see, so restricted channels never leak to other sites.
 */
export function emitChannelEvent(
  communityId: string,
  channel: { id: string; parentId: string | null; name: string; type: string },
  event: WebhookEvent,
  data: () => Promise<Record<string, unknown> | null>,
): void {
  emitWebhook(communityId, event, async () => {
    if (!(await everyoneCanView({ ...channel, communityId }))) return null;
    const d = await data();
    return d ? { channel: { id: channel.id, name: channel.name }, ...d } : null;
  });
}
