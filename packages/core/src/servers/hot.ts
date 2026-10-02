import { and, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { POLL } from './schedule';

// "Hot" endpoints (someone is watching them live) are polled every minute. Kept apart from the
// server service so the realtime server can mark them without loading the rest.

/**
 * Mark endpoints as being watched. One that wasn't watched gets its next poll brought forward,
 * so a viewer sees fresh status within seconds rather than at the next slow-tier poll. Only
 * endpoints someone still lists: anyone can ask to watch any id, and an abandoned endpoint must
 * stay dormant.
 */
export async function markEndpointsHot(endpointIds: string[]): Promise<void> {
  if (!endpointIds.length) return;
  const e = schema.serverEndpoints;
  const g = schema.gameServers;
  await db
    .update(e)
    .set({
      hotUntil: new Date(Date.now() + POLL.hotWindowMs),
      dormant: false,
      nextPollAt: sql`case when ${e.hotUntil} is null or ${e.hotUntil} < now()
        then least(${e.nextPollAt}, now() + interval '10 seconds') else ${e.nextPollAt} end`,
    })
    .where(
      and(
        inArray(e.id, endpointIds),
        // Already hot for a while yet: nothing to write.
        or(isNull(e.hotUntil), sql`${e.hotUntil} < now() + interval '5 minutes'`),
        sql`exists (select 1 from ${g} where ${g.endpointId} = ${e.id} and ${g.deletedAt} is null)`,
      ),
    );
}

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * A live viewer subscribed to a server's updates (realtime server). Batched: one update every
 * few seconds for everything watched since.
 */
export function noteServerViewer(endpointId: string): void {
  pending.add(endpointId);
  timer ??= setTimeout(() => {
    timer = null;
    const ids = [...pending];
    pending.clear();
    markEndpointsHot(ids).catch(() => undefined);
  }, 5_000);
}
