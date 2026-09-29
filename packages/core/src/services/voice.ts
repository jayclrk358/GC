import { AccessToken, TrackSource, WebhookReceiver, type ParticipantInfo } from 'livekit-server-sdk';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { has, Permission, planLimits, planPerks } from '@magnox/shared';
import { requireMember, type MemberContext } from '../access';
import { realtime } from '../emitter';
import { env } from '../env';
import { AppError, forbidden, notFound, unauthorized } from '../errors';
import { logger } from '../logger';
import { cacheRedis } from '../redis';
import { communityPlan } from './billing';
import { getChannelById } from './channels';
import { loadAuthors } from './chat';
import { livekit, peopleKey, ROOM_PREFIX, roomOf, voiceEnabled } from './voice-rooms';

export { voiceEnabled };

const log = logger('voice');

/** Someone in a voice channel, as the channel list shows them. */
export interface VoicePerson {
  id: string;
  name: string;
  image: string | null;
}

/** Who's in a channel is kept in Redis for a day at most, in case an event goes missing. */
const PEOPLE_TTL = 24 * 3600;

/** Where browsers connect: LIVEKIT_URL, or this site (Caddy passes /rtc on to LiveKit). */
function publicUrl(): string {
  if (env().LIVEKIT_URL) return env().LIVEKIT_URL;
  const url = new URL(env().APP_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

async function voiceChannel(ctx: MemberContext, channelId: string) {
  const channel = await getChannelById(ctx, channelId);
  if (channel.type !== 'voice') throw notFound('Voice channel');
  return channel;
}

export interface VoiceJoin {
  url: string;
  token: string;
  canSpeak: boolean;
  canShare: boolean;
}

/**
 * A ticket to join a voice channel: checks the member may connect, the community's plan has
 * voice and the channel isn't full, then signs a short-lived LiveKit token with what they may
 * do there (talk if they can speak; share a screen on Pro).
 */
export async function joinVoice(ctx: MemberContext, channelId: string): Promise<VoiceJoin> {
  if (!voiceEnabled()) throw new AppError('bad_request', "Voice isn't set up on this site yet.");
  if (!ctx.userId) throw unauthorized();
  requireMember(ctx);
  const channel = await voiceChannel(ctx, channelId);
  const perms = BigInt(channel.perms);
  if (!has(perms, Permission.CONNECT)) throw forbidden("You can't join this voice channel.");
  const plan = await communityPlan(ctx.community.id);
  const limits = planLimits(plan);
  if (!limits.voiceChannels) {
    throw new AppError(
      'forbidden',
      'Voice channels need the Plus plan. Upgrade in Plan & billing.',
    );
  }
  const room = roomOf(channel.id);
  const inside = await livekit()
    .listParticipants(room)
    .catch(() => [] as ParticipantInfo[]);
  if (inside.filter((p) => p.identity !== ctx.userId).length >= limits.voiceParticipants) {
    throw new AppError(
      'forbidden',
      `This voice channel is full (up to ${limits.voiceParticipants} people on this plan).`,
    );
  }
  // Rooms are made on first use; asking again for one that exists is harmless.
  await livekit().createRoom({
    name: room,
    maxParticipants: limits.voiceParticipants,
    emptyTimeout: 60,
    departureTimeout: 20,
  });
  const canSpeak = has(perms, Permission.SPEAK);
  const canShare = canSpeak && planPerks(plan).screenShare;
  const me = (await loadAuthors(ctx.community.id, [ctx.userId])).get(ctx.userId);
  const token = new AccessToken(env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET, {
    identity: ctx.userId,
    name: me?.nickname || me?.name || 'Member',
    metadata: JSON.stringify({ image: me?.image ?? null, username: me?.username ?? null }),
    ttl: '6h',
  });
  token.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: canSpeak,
    canPublishData: false,
    canPublishSources: canSpeak
      ? canShare
        ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [TrackSource.MICROPHONE]
      : [],
  });
  return { url: publicUrl(), token: await token.toJwt(), canSpeak, canShare };
}

function personOf(p: { identity: string; name?: string; metadata?: string }): VoicePerson {
  let image: string | null = null;
  try {
    image = (JSON.parse(p.metadata || '{}') as { image?: string | null }).image ?? null;
  } catch {
    // Metadata we didn't write; the name is enough.
  }
  return { id: p.identity, name: p.name || 'Member', image };
}

/** Who's in each of a community's voice channels (for the channel list). */
export async function voicePeople(communityId: string): Promise<Record<string, VoicePerson[]>> {
  const channels = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(and(eq(schema.channels.communityId, communityId), eq(schema.channels.type, 'voice')));
  if (!channels.length) return {};
  const pipe = cacheRedis().pipeline();
  for (const c of channels) pipe.hvals(peopleKey(c.id));
  const results = (await pipe.exec()) ?? [];
  return Object.fromEntries(
    channels.map((c, i) => [
      c.id,
      ((results[i]?.[1] as string[] | undefined) ?? []).map((v) => JSON.parse(v) as VoicePerson),
    ]),
  );
}

/** Tell a community's open pages who's now in a voice channel. */
async function publishPeople(channelId: string): Promise<void> {
  const [channel] = await db
    .select({ communityId: schema.channels.communityId })
    .from(schema.channels)
    .where(eq(schema.channels.id, channelId))
    .limit(1);
  if (!channel) return;
  const people = (await cacheRedis().hvals(peopleKey(channelId))).map(
    (v) => JSON.parse(v) as VoicePerson,
  );
  realtime().to(`community:${channel.communityId}`).emit('voice:state', { channelId, people });
}

/**
 * LiveKit's webhook: people joining and leaving voice channels. Signed with the API secret,
 * so only our LiveKit server can send these.
 */
export async function handleVoiceWebhook(body: string, auth: string | null): Promise<void> {
  if (!voiceEnabled()) return;
  const event = await new WebhookReceiver(env().LIVEKIT_API_KEY, env().LIVEKIT_API_SECRET).receive(
    body,
    auth ?? undefined,
  );
  const room = event.room?.name ?? '';
  if (!room.startsWith(ROOM_PREFIX)) return;
  const channelId = room.slice(ROOM_PREFIX.length);
  const key = peopleKey(channelId);
  const redis = cacheRedis();
  if (event.event === 'participant_joined' && event.participant) {
    const person = personOf(event.participant);
    await redis.multi().hset(key, person.id, JSON.stringify(person)).expire(key, PEOPLE_TTL).exec();
  } else if (event.event === 'participant_left' && event.participant) {
    await redis.hdel(key, event.participant.identity);
  } else if (event.event === 'room_finished') {
    await redis.del(key);
  } else {
    return;
  }
  await publishPeople(channelId);
}

/**
 * Check the list against LiveKit itself (when someone opens the channel), in case a webhook
 * was missed while the site was restarting.
 */
export async function syncVoicePeople(channelId: string): Promise<VoicePerson[]> {
  if (!voiceEnabled()) return [];
  const key = peopleKey(channelId);
  let inside: ParticipantInfo[];
  try {
    inside = await livekit().listParticipants(roomOf(channelId));
  } catch {
    inside = []; // No such room: nobody's there.
  }
  const people = inside.map(personOf);
  const stored = (await cacheRedis().hvals(key)).map((v) => JSON.parse(v) as VoicePerson);
  const same =
    stored.length === people.length &&
    people.every((p) => stored.some((s) => s.id === p.id && s.name === p.name));
  if (!same) {
    const multi = cacheRedis().multi().del(key);
    for (const p of people) multi.hset(key, p.id, JSON.stringify(p));
    await multi.expire(key, PEOPLE_TTL).exec();
    await publishPeople(channelId);
  }
  return people;
}

/** Moderators (Mute members): mute someone's microphone, or remove them from the call. */
export async function moderateVoice(
  ctx: MemberContext,
  channelId: string,
  userId: string,
  action: 'mute' | 'disconnect',
): Promise<void> {
  if (!voiceEnabled()) throw new AppError('bad_request', "Voice isn't set up on this site yet.");
  const channel = await voiceChannel(ctx, channelId);
  if (!has(BigInt(channel.perms), Permission.MUTE_MEMBERS)) throw forbidden();
  const room = roomOf(channel.id);
  try {
    if (action === 'disconnect') {
      await livekit().removeParticipant(room, userId);
    } else {
      const who = await livekit().getParticipant(room, userId);
      for (const track of who.tracks) {
        if (track.source === TrackSource.MICROPHONE && !track.muted) {
          await livekit().mutePublishedTrack(room, userId, track.sid, true);
        }
      }
    }
  } catch (err) {
    log.debug({ err: (err as Error).message, channelId, userId }, 'voice moderation missed');
    throw new AppError('not_found', "They aren't in this voice channel any more.");
  }
}
