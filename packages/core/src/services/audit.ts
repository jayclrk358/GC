import { schema, type DbOrTx } from '@magnox/db';
import { newId } from '@magnox/shared';
import { communityChanged } from '../emitter';

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
  // Chat deletions already reach open channels as message events.
  if (!entry.action.startsWith('message.')) communityChanged(entry.communityId, entry.actorId);
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
