import { Emitter } from '@socket.io/redis-emitter';
import { logger } from './logger';
import { cacheRedis } from './redis';

let emitter: Emitter | undefined;

/**
 * What the emitter publishes through. It only ever calls `publish`, and never waits on the
 * result: during a Redis blip that would be an unhandled rejection, which ends the process. Live
 * updates are best effort, so a failed one is logged and dropped.
 */
const publisher = {
  publish: (channel: string, message: string | Buffer) =>
    cacheRedis()
      .publish(channel, message)
      .catch((err: Error) => {
        logger('emitter').warn({ err: err.message, channel }, 'realtime publish failed');
        return 0;
      }),
};

/**
 * Publish events to connected sockets from any process (web, worker). The realtime server's
 * Redis adapter relays them to the right rooms.
 */
export function realtime(): Emitter {
  emitter ??= new Emitter(publisher);
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

/**
 * Someone's access in a community may have shrunk (kicked, banned, roles or channel permissions
 * changed, community made private or suspended). The realtime server re-checks the rooms its
 * sockets joined there (only that person's, with `userId`) and leaves those no longer allowed:
 * rooms are otherwise only checked when joined.
 */
export function accessChanged(communityId: string, userId?: string): void {
  realtime().serverSideEmit('access:changed', { communityId, userId: userId ?? null });
}
