import { and, desc, eq, gt, isNull, ne, or, lt, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { env } from '../env';
import { logger } from '../logger';
import { renderEmail, sendMail } from '../mail';

// Email digests: a round-up of unread notifications, daily or weekly, for people who ask for one.

const log = logger('digest');

const PERIOD_MS = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 } as const;
// A little slack so an hourly job doesn't drift a digest an hour later each time.
const SLACK_MS = 30 * 60_000;

export interface DigestItem {
  title: string;
  community: string | null;
  url: string;
}

/** The email for some unread notifications (shared by the job and tests). */
export function digestEmail(
  period: 'daily' | 'weekly',
  total: number,
  items: DigestItem[],
  baseUrl: string,
) {
  const heading =
    total === 1 ? 'You have 1 unread notification' : `You have ${total} unread notifications`;
  const lines = items.map(
    (i) => `• ${i.title}${i.community ? ` (${i.community})` : ''}\n  ${baseUrl}${i.url}`,
  );
  const more = total > items.length ? `\n…and ${total - items.length} more.` : '';
  const body = `${period === 'daily' ? 'Since yesterday' : 'This week'} on Magnox:\n\n${lines.join('\n')}${more}\n\nYou can change or turn off these emails in your notification settings.`;
  return {
    subject: `${heading} on Magnox`,
    ...renderEmail({
      heading,
      body,
      action: { label: 'See your notifications', url: `${baseUrl}/notifications` },
    }),
  };
}

/** Send the digests that are due. Runs hourly; returns how many emails went out. */
export async function sendDigests(now = new Date()): Promise<number> {
  const base = env().APP_URL.replace(/\/$/, '');
  const ns = schema.notificationSettings;
  const due = await db
    .select({
      userId: ns.userId,
      digest: ns.digest,
      last: ns.lastDigestAt,
      email: schema.users.email,
    })
    .from(ns)
    .innerJoin(schema.users, eq(schema.users.id, ns.userId))
    .where(
      and(
        ne(ns.digest, 'off'),
        eq(schema.users.banned, false),
        isNull(schema.users.deletedAt),
        or(
          isNull(ns.lastDigestAt),
          and(
            eq(ns.digest, 'daily'),
            lt(ns.lastDigestAt, new Date(now.getTime() - PERIOD_MS.daily + SLACK_MS)),
          ),
          and(
            eq(ns.digest, 'weekly'),
            lt(ns.lastDigestAt, new Date(now.getTime() - PERIOD_MS.weekly + SLACK_MS)),
          ),
        ),
      ),
    )
    .limit(500);
  let sent = 0;
  for (const u of due) {
    const period = u.digest === 'weekly' ? 'weekly' : 'daily';
    const since = new Date(Math.max(u.last?.getTime() ?? 0, now.getTime() - PERIOD_MS[period]));
    const unread = and(
      eq(schema.notifications.userId, u.userId),
      isNull(schema.notifications.readAt),
      gt(schema.notifications.createdAt, since),
    );
    const [rows, [count]] = await Promise.all([
      db
        .select({ data: schema.notifications.data, url: schema.notifications.url })
        .from(schema.notifications)
        .where(unread)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(10),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.notifications)
        .where(unread),
    ]);
    // Marked as done either way, so nobody gets a digest every hour.
    await db.update(ns).set({ lastDigestAt: now }).where(eq(ns.userId, u.userId));
    const total = count?.n ?? 0;
    if (!total) continue;
    const mail = digestEmail(
      period,
      total,
      rows.map((r) => ({
        title: r.data.title ?? 'Notification',
        community: r.data.community ?? null,
        url: r.url,
      })),
      base,
    );
    try {
      await sendMail({ to: u.email, ...mail });
      sent++;
    } catch (err) {
      log.warn({ err: (err as Error).message, userId: u.userId }, 'digest email failed');
    }
  }
  return sent;
}
