import { RoomServiceClient } from 'livekit-server-sdk';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { env } from '../env';
import { logger } from '../logger';
import { cacheRedis } from '../redis';

// The LiveKit side of voice channels, kept apart from voice.ts so the channel and moderation
// services can end calls without importing everything voice.ts does.

const log = logger('voice');

// Voice channels are LiveKit rooms named after the channel.
export const ROOM_PREFIX = 'voice-';
export const roomOf = (channelId: string) => `${ROOM_PREFIX}${channelId}`;
export const peopleKey = (channelId: string) => `voice:${channelId}`;

/** Whether this site has voice set up (LiveKit's key and secret are configured). */
export function voiceEnabled(): boolean {
  return Boolean(env().LIVEKIT_API_KEY && env().LIVEKIT_API_SECRET);
}

let client: RoomServiceClient | undefined;
export function livekit(): RoomServiceClient {
  client ??= new RoomServiceClient(
    env().LIVEKIT_API_URL,
    env().LIVEKIT_API_KEY,
    env().LIVEKIT_API_SECRET,
    // A voice channel's page asks who's there, so don't let a stuck LiveKit hold it up for long.
    { requestTimeout: 3 },
  );
  return client;
}

async function voiceChannelIds(communityId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(and(eq(schema.channels.communityId, communityId), eq(schema.channels.type, 'voice')));
  return rows.map((r) => r.id);
}

/** End a voice channel's call, for everyone in it (the channel is being deleted). */
export async function endVoiceCall(channelId: string): Promise<void> {
  if (!voiceEnabled()) return;
  await livekit()
    .deleteRoom(roomOf(channelId))
    .catch(() => {
      // No call going on.
    });
  await cacheRedis().del(peopleKey(channelId));
}

/** End every call in a community (it's being deleted). */
export async function endCommunityVoiceCalls(communityId: string): Promise<void> {
  if (!voiceEnabled()) return;
  await Promise.all((await voiceChannelIds(communityId)).map(endVoiceCall));
}

/**
 * Take someone out of any call in a community (kicked, banned, timed out or left). A LiveKit
 * ticket is only checked on the way in, so without this they'd stay until they hung up.
 */
export async function removeFromVoice(communityId: string, userId: string): Promise<void> {
  if (!voiceEnabled()) return;
  const ids = await voiceChannelIds(communityId);
  // Asked of LiveKit itself rather than the list in Redis, in case that missed them joining.
  const results = await Promise.allSettled(
    ids.map((id) => livekit().removeParticipant(roomOf(id), userId)),
  );
  const removed = results.filter((r) => r.status === 'fulfilled').length;
  if (removed) log.info({ communityId, userId, removed }, 'removed from voice');
}
