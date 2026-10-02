import { canSubscribe, forgetRoomAccess, type RoomGrant } from '@magnox/core/access';

/** Bumped whenever access changes somewhere, so a subscribe checked meanwhile is checked again. */
let generation = 0;

/**
 * Decide whether a user may join a room, and which community it belongs to. Every room kind is
 * checked against the database.
 */
export async function authorizeRoom(
  userId: string | null,
  room: string,
): Promise<RoomGrant | null> {
  const [kind, id] = room.split(':') as [string, string];
  const seen = generation;
  const grant = await canSubscribe(userId, kind, id);
  // Access changed while this was being checked, perhaps from a cached answer from before: the
  // re-check of joined rooms can't have seen this one yet, so check it again.
  return grant && seen !== generation ? canSubscribe(userId, kind, id) : grant;
}

/** Someone's access in a community (everyone's, without `userId`) may have shrunk. */
export function noteAccessChanged(communityId: string, userId: string | null): void {
  generation++;
  forgetRoomAccess(communityId, userId);
}
