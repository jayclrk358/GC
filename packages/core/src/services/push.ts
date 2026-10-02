import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { newId } from '@magnox/shared';
import type * as WebPushModule from 'web-push';
import { z } from 'zod';
import { env } from '../env';
import { unauthorized } from '../errors';
import { logger } from '../logger';
import { enqueue, QUEUES } from '../queues';
import { cacheRedis } from '../redis';

// Web Push: notifications on people's phones and desktops, even with Magnox closed.

const log = logger('push');

/** The public key browsers subscribe with, or null when push isn't set up (no VAPID keys). */
export function pushPublicKey(): string | null {
  const e = env();
  return e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY ? e.VAPID_PUBLIC_KEY : null;
}

/**
 * Browsers' push services. The worker sends to whatever endpoint a browser gives, so only these
 * are accepted: anything else could point the worker at internal services (SSRF).
 */
const PUSH_SERVICES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // Tests point at the local fixture server instead (never enabled in production).
  if (env().SERVER_QUERY_ALLOW_PRIVATE)
    return url.protocol === 'https:' || url.protocol === 'http:';
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === 'https:' &&
    !url.port &&
    PUSH_SERVICES.some((d) => host === d || host.endsWith(`.${d}`))
  );
}

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2000)
    .refine(isAllowedPushEndpoint, 'That isn’t a push service this site can send to.'),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(4).max(100),
  }),
});

/** Remember a browser's push subscription for someone (a browser belongs to one account). */
export async function savePushSubscription(
  userId: string | null,
  raw: unknown,
  userAgent = '',
): Promise<void> {
  if (!userId) throw unauthorized();
  const sub = subscriptionSchema.parse(raw);
  const values = {
    userId,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: userAgent.slice(0, 300),
    failures: 0,
  };
  await db
    .insert(schema.pushSubscriptions)
    .values({ id: newId(), endpoint: sub.endpoint, ...values })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });
  // Ten devices is plenty; drop the oldest beyond that.
  await db.execute(sql`
    delete from push_subscriptions where user_id = ${userId} and id not in (
      select id from push_subscriptions where user_id = ${userId} order by created_at desc limit 10
    )`);
}

export async function removePushSubscription(userId: string | null, rawEndpoint: unknown) {
  if (!userId) throw unauthorized();
  const endpoint = z.string().max(2000).parse(rawEndpoint);
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export interface PushItem {
  userId: string;
  title: string;
  body?: string;
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

/** Send notifications to people's devices, in the background (only when push is set up). */
export async function queuePush(items: PushItem[]): Promise<void> {
  if (!pushPublicKey() || !items.length) return;
  for (let i = 0; i < items.length; i += 200) {
    await enqueue(
      QUEUES.notify,
      'push',
      { items: items.slice(i, i + 200) },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    ).catch((err: Error) => log.warn({ err: err.message }, 'could not queue push'));
  }
}

type WebPush = typeof WebPushModule;
let webpush: WebPush | null = null;

async function client(): Promise<WebPush> {
  if (!webpush) {
    webpush = (await import('web-push')).default as unknown as WebPush;
    const e = env();
    webpush.setVapidDetails(
      e.VAPID_SUBJECT ?? `mailto:${e.CONTACT_EMAIL ?? 'admin@example.com'}`,
      e.VAPID_PUBLIC_KEY!,
      e.VAPID_PRIVATE_KEY!,
    );
  }
  return webpush;
}

/** The worker's side: deliver to each person's devices, skipping people using Magnox right now. */
export async function sendPushes(items: PushItem[]): Promise<number> {
  if (!pushPublicKey() || !items.length) return 0;
  const userIds = [...new Set(items.map((i) => i.userId))];
  const online = new Set<string>();
  const states = await cacheRedis()
    .mget(userIds.map((id) => `presence:${id}`))
    .catch(() => userIds.map(() => null));
  userIds.forEach((id, i) => states[i] && online.add(id));
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(
      inArray(
        schema.pushSubscriptions.userId,
        userIds.filter((id) => !online.has(id)),
      ),
    );
  if (!subs.length) return 0;
  const push = await client();
  const base = env().APP_URL.replace(/\/$/, '');
  let sent = 0;
  // Written once at the end rather than per send.
  const delivered = new Set<string>();
  const gone = new Set<string>();
  const failed = new Set<string>();
  for (const item of items) {
    if (online.has(item.userId)) continue;
    const payload = JSON.stringify({
      title: item.title.slice(0, 120),
      body: item.body?.slice(0, 200) ?? '',
      url: item.url.startsWith('/') ? `${base}${item.url}` : item.url,
      tag: item.tag,
    });
    for (const sub of subs.filter((s) => s.userId === item.userId)) {
      if (!isAllowedPushEndpoint(sub.endpoint)) continue;
      try {
        // web-push builds the encrypted, signed request; we send it (with a timeout).
        const req = push.generateRequestDetails(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        );
        const res = await fetch(req.endpoint, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.body as Uint8Array<ArrayBuffer> | null,
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status >= 300) {
          throw Object.assign(new Error(`push service said ${res.status}`), {
            statusCode: res.status,
          });
        }
        sent++;
        delivered.add(sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Gone (unsubscribed or expired), or failing for a long time: stop trying.
        if (status === 404 || status === 410 || sub.failures >= 9) gone.add(sub.id);
        else {
          failed.add(sub.id);
          log.warn({ status, err: (err as Error).message }, 'push failed');
        }
      }
    }
  }
  const ps = schema.pushSubscriptions;
  for (const id of gone) failed.delete(id);
  for (const id of delivered) failed.delete(id);
  await Promise.all([
    delivered.size &&
      db
        .update(ps)
        .set({ failures: 0, lastSentAt: new Date() })
        .where(inArray(ps.id, [...delivered])),
    failed.size &&
      db
        .update(ps)
        .set({ failures: sql`${ps.failures} + 1` })
        .where(inArray(ps.id, [...failed])),
    gone.size && db.delete(ps).where(inArray(ps.id, [...gone])),
  ]);
  return sent;
}
