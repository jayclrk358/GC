import { schema, type DbOrTx } from '@gamecentral/db';
import { newId } from '@gamecentral/shared';
import { communityChanged, type ChangeScope } from '../emitter';

export interface AuditEntry {
  communityId: string;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
  reason?: string;
}

export async function audit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(schema.auditLog).values({
    id: newId(),
    communityId: entry.communityId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    diff: entry.diff ?? null,
    reason: entry.reason ?? null,
  });
  const scope = changeScope(entry.action);
  if (scope) communityChanged(entry.communityId, entry.actorId, scope);
  // Someone's own roles or timeout changed: just their pages need to catch up.
  if (/^member\.(role\.|timeout)/.test(entry.action) && entry.targetId) {
    communityChanged(entry.communityId, entry.actorId, 'layout', entry.targetId);
  }
}

/**
 * Which open pages an audited change affects, or null for changes nobody else sees (moderation
 * tools, reports, webhooks, automod, chat deletions, which reach open channels as message
 * events).
 */
export function changeScope(action: string): ChangeScope | null {
  const [area, what] = action.split('.');
  switch (area) {
    case 'community':
      return what === 'create' ? null : 'layout';
    case 'channel':
    case 'role':
      return 'layout';
    case 'member':
      // Role and timeout changes only matter to that person (see above).
      return what === 'role' || what === 'timeout' ? null : 'members';
    case 'application':
      return what === 'approve' ? 'members' : null;
    case 'page':
      return 'page';
    case 'server':
      return 'servers';
    case 'event':
      return 'events';
    case 'wiki':
      return 'wiki';
    case 'thread':
    case 'post':
      return 'forum';
    default:
      return null;
  }
}

/** Shallow diff of changed keys, for audit entries. */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(v)) out[k] = { from: before[k], to: v };
  }
  return out;
}
