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
