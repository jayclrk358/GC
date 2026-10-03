'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Participant, RemoteTrack, Room, VideoTrack } from 'livekit-client';
import type { VoicePerson, VoiceStateEvent } from '@gamecentral/core';
import { joinVoiceAction } from '@/app/actions/voice';
import { useRooms } from '@/lib/realtime';
import { playSound } from '@/lib/sounds';

/** Someone in the call you're in, as LiveKit reports them. */
export interface VoiceMember extends VoicePerson {
  speaking: boolean;
  muted: boolean;
  me: boolean;
}

export interface VoiceScreen {
  id: string;
  name: string;
  track: VideoTrack;
}

interface VoiceContextValue {
  communityId: string;
  /** Who's in each voice channel (for everyone, from the server). */
  people: Record<string, VoicePerson[]>;
  /** The call you're in, if any. */
  channelId: string | null;
  channelName: string | null;
  status: 'idle' | 'connecting' | 'connected';
  members: VoiceMember[];
  screens: VoiceScreen[];
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
  canSpeak: boolean;
  canShare: boolean;
  join: (channelId: string, channelName: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleShare: () => void;
}

const VoiceContext = React.createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue | null {
  return React.useContext(VoiceContext);
}

function personOf(p: Participant): VoicePerson {
  let image: string | null = null;
  try {
    image = (JSON.parse(p.metadata || '{}') as { image?: string | null }).image ?? null;
  } catch {
    // Not our metadata; a name is enough.
  }
  return { id: p.identity, name: p.name || 'Member', image };
}

/** Apply a change in who's in a voice channel (someone joined or left, or the whole list). */
function applyVoiceState(
  people: Record<string, VoicePerson[]>,
  e: VoiceStateEvent,
): Record<string, VoicePerson[]> {
  const list = people[e.channelId] ?? [];
  const next =
    'people' in e
      ? e.people
      : 'joined' in e
        ? [...list.filter((p) => p.id !== e.joined.id), e.joined]
        : list.filter((p) => p.id !== e.left);
  return { ...people, [e.channelId]: next };
}

/**
 * Voice for one community: who's in which voice channel (kept live), and the call you're in.
 * The call lives here, above the pages, so it carries on while you move between channels.
 * LiveKit's client code only loads when you join.
 */
export function VoiceProvider({
  communityId,
  initialPeople,
  children,
}: {
  communityId: string;
  /** Who's in each voice channel you can see (an entry for every one, even if empty). */
  initialPeople: Record<string, VoicePerson[]>;
  children: React.ReactNode;
}) {
  const t = useTranslations('voice');
  const [people, setPeople] = React.useState(initialPeople);
  // The page was refreshed (channels or permissions changed): start again from what it says.
  const [lastInitial, setLastInitial] = React.useState(initialPeople);
  if (initialPeople !== lastInitial) {
    setLastInitial(initialPeople);
    setPeople(initialPeople);
  }
  const [channel, setChannel] = React.useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = React.useState<VoiceContextValue['status']>('idle');
  const [members, setMembers] = React.useState<VoiceMember[]>([]);
  const [screens, setScreens] = React.useState<VoiceScreen[]>([]);
  const [muted, setMuted] = React.useState(false);
  const [deafened, setDeafened] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [rights, setRights] = React.useState({ canSpeak: false, canShare: false });
  const room = React.useRef<Room | null>(null);
  const audio = React.useRef<HTMLDivElement>(null);
  const deafRef = React.useRef(false);
  const mutedRef = React.useRef(false);
  const mutedBeforeDeafen = React.useRef(false);

  // Each voice channel's own room: only people who can see a channel hear who's in it.
  const voiceRooms = Object.keys(initialPeople)
    .sort()
    .map((id) => `channel:${id}`);
  useRooms(voiceRooms, {
    'voice:state': (e: VoiceStateEvent) => {
      if (!(e.channelId in initialPeople)) return;
      setPeople((prev) => applyVoiceState(prev, e));
    },
  });

  // The roster and screens come straight from the room whenever something changes in it.
  const refresh = React.useCallback(() => {
    const r = room.current;
    if (!r) return;
    const all: Participant[] = [r.localParticipant, ...r.remoteParticipants.values()];
    setMembers(
      all.map((p) => ({
        ...personOf(p),
        speaking: p.isSpeaking,
        muted: !p.isMicrophoneEnabled,
        me: p === r.localParticipant,
      })),
    );
    setScreens(
      all.flatMap((p) => {
        const track = [...p.trackPublications.values()].find(
          (pub) => pub.source === 'screen_share' && pub.videoTrack,
        )?.videoTrack;
        return track ? [{ id: p.identity, name: p.name || 'Member', track }] : [];
      }),
    );
    setSharing(r.localParticipant.isScreenShareEnabled);
    mutedRef.current = !r.localParticipant.isMicrophoneEnabled;
    setMuted(mutedRef.current);
  }, []);

  const reset = React.useCallback(() => {
    room.current = null;
    setChannel(null);
    setStatus('idle');
    setMembers([]);
    setScreens([]);
    setSharing(false);
    if (audio.current) audio.current.replaceChildren();
  }, []);

  const leave = React.useCallback(() => {
    const r = room.current;
    reset();
    if (r) playSound('disconnect');
    void r?.disconnect();
  }, [reset]);

  const join = React.useCallback(
    async (channelId: string, channelName: string) => {
      if (room.current) {
        if (channel?.id === channelId) return;
        leave();
      }
      // Read before connecting: the room's events update the mute state as it connects.
      const startMuted = mutedRef.current || deafRef.current;
      setChannel({ id: channelId, name: channelName });
      setStatus('connecting');
      const ticket = await joinVoiceAction(communityId, channelId);
      if (!ticket.ok) {
        toast.error(ticket.error);
        reset();
        return;
      }
      const { DisconnectReason, Room: LiveRoom, RoomEvent } = await import('livekit-client');
      const r = new LiveRoom({ adaptiveStream: true, dynacast: true });
      room.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === 'audio') {
          const el = track.attach();
          if (deafRef.current) el.muted = true;
          audio.current?.append(el);
        }
        refresh();
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const el of track.detach()) el.remove();
        refresh();
      });
      // Others coming and going, as in any voice app (not while you've deafened yourself).
      r.on(RoomEvent.ParticipantConnected, () => {
        if (!deafRef.current) playSound('join');
      });
      r.on(RoomEvent.ParticipantDisconnected, () => {
        if (!deafRef.current) playSound('leave');
      });
      for (const e of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackPublished,
        RoomEvent.TrackUnpublished,
      ]) {
        r.on(e, refresh);
      }
      r.on(RoomEvent.Disconnected, (reason?: number) => {
        if (room.current !== r) return;
        reset();
        playSound('disconnect');
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) toast.info(t('removedYou'));
        else if (reason === DisconnectReason.ROOM_DELETED) toast.info(t('callEnded'));
      });
      try {
        await r.connect(ticket.data.url, ticket.data.token);
        await r.startAudio();
        setRights({ canSpeak: ticket.data.canSpeak, canShare: ticket.data.canShare });
        // Muted (or deafened) beforehand from the user panel: join that way.
        if (ticket.data.canSpeak && !startMuted) {
          await r.localParticipant.setMicrophoneEnabled(true).catch(() => {
            toast.error(t('noMicrophone'));
          });
        }
        setStatus('connected');
        playSound('connect');
        refresh();
      } catch {
        toast.error(t('connectFailed'));
        if (room.current === r) leave();
      }
    },
    [channel?.id, communityId, leave, refresh, reset, t],
  );

  const toggleMute = React.useCallback(() => {
    const r = room.current;
    if (!r) {
      // Not in a call: remember it for the next one.
      mutedRef.current = !mutedRef.current;
      setMuted(mutedRef.current);
      playSound(mutedRef.current ? 'mute' : 'unmute');
      return;
    }
    if (!rights.canSpeak) return;
    const on = !r.localParticipant.isMicrophoneEnabled;
    void r.localParticipant
      .setMicrophoneEnabled(on)
      .then(() => {
        playSound(on ? 'unmute' : 'mute');
        refresh();
      })
      .catch(() => toast.error(t('noMicrophone')));
  }, [refresh, rights.canSpeak, t]);

  const toggleDeafen = React.useCallback(() => {
    const r = room.current;
    const next = !deafRef.current;
    deafRef.current = next;
    setDeafened(next);
    playSound(next ? 'deafen' : 'undeafen');
    if (!r) return; // Not in a call: the next one starts deafened (and so muted).
    for (const el of audio.current?.querySelectorAll('audio') ?? []) el.muted = next;
    // Like other voice apps, deafening also mutes you, and undeafening restores how you were.
    if (rights.canSpeak) {
      if (next) {
        mutedBeforeDeafen.current = !r.localParticipant.isMicrophoneEnabled;
        void r.localParticipant.setMicrophoneEnabled(false).then(refresh);
      } else if (!mutedBeforeDeafen.current) {
        void r.localParticipant.setMicrophoneEnabled(true).then(refresh);
      }
    }
  }, [refresh, rights.canSpeak]);

  const toggleShare = React.useCallback(() => {
    const r = room.current;
    if (!r || !rights.canShare) return;
    const on = !r.localParticipant.isScreenShareEnabled;
    void r.localParticipant
      .setScreenShareEnabled(on, { audio: true })
      .then(refresh)
      .catch(() => {
        // Cancelling the browser's picker lands here too; nothing to report.
        refresh();
      });
  }, [refresh, rights.canShare]);

  // Leaving the community (this provider unmounting) ends the call.
  React.useEffect(() => () => void room.current?.disconnect(), []);

  const value = React.useMemo<VoiceContextValue>(
    () => ({
      communityId,
      people,
      channelId: channel?.id ?? null,
      channelName: channel?.name ?? null,
      status,
      members,
      screens,
      muted,
      deafened,
      sharing,
      canSpeak: rights.canSpeak,
      canShare: rights.canShare,
      join,
      leave,
      toggleMute,
      toggleDeafen,
      toggleShare,
    }),
    [
      communityId,
      people,
      channel,
      status,
      members,
      screens,
      muted,
      deafened,
      sharing,
      rights,
      join,
      leave,
      toggleMute,
      toggleDeafen,
      toggleShare,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {/* Everyone else's voices play from here. */}
      <div ref={audio} hidden />
    </VoiceContext.Provider>
  );
}
