import { Emitter } from '@socket.io/redis-emitter';
import { cacheRedis } from './redis';

let emitter: Emitter | undefined;

/**
 * Publish events to connected sockets from any process (web, worker). The realtime server's
 * Redis adapter relays them to the right rooms.
 */
export function realtime(): Emitter {
  emitter ??= new Emitter(cacheRedis());
  return emitter;
}

/**
 * Tell open pages of a community that something changed (settings, members, wiki…) so they can
 * refresh. Pages wait a moment before refreshing, which covers the enclosing transaction
 * committing after this is sent.
 */
export function communityChanged(communityId: string, actorId: string | null): void {
  realtime().to(`community:${communityId}`).emit('community:changed', { communityId, actorId });
}
