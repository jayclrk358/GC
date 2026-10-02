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
 * What a change affects, so open pages refresh only when they show it:
 * - layout: the whole community (theme, name, navigation, channels, roles, plan), every page;
 * - members: the member list; page: the landing page; servers: server lists and blocks;
 *   events, wiki, forum: those sections.
 */
export type ChangeScope = 'layout' | 'members' | 'page' | 'servers' | 'events' | 'wiki' | 'forum';

/**
 * Tell open pages of a community that something changed so they can refresh. Pages wait a moment
 * before refreshing (plus a little randomness, so a busy community's readers don't all refresh at
 * once), which also covers the enclosing transaction committing after this is sent. With
 * `onlyUser`, just that person's pages hear about it (e.g. their own roles changed).
 */
export function communityChanged(
  communityId: string,
  actorId: string | null,
  scope: ChangeScope,
  onlyUser?: string,
): void {
  realtime()
    .to(onlyUser ? `user:${onlyUser}` : `community:${communityId}`)
    .emit('community:changed', { communityId, actorId, scope });
}
