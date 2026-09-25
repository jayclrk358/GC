import { canSubscribe } from '@magnox/core/access';

/** Decide whether a user may join a room. Every room kind is checked against the database. */
export async function authorizeRoom(userId: string | null, room: string): Promise<boolean> {
  const [kind, id] = room.split(':') as [string, string];
  return canSubscribe(userId, kind, id);
}
