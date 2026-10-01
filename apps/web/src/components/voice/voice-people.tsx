'use client';

import { useTranslations } from 'next-intl';
import { HeadphoneOff, MicOff } from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useVoice } from './voice-provider';

/**
 * Who's in a voice channel, as a tree under its name in the channel list (as TeamSpeak shows
 * it). In the call yourself, it's live: a green ring for whoever's talking, and who's muted or
 * sharing their screen.
 */
export function VoiceChannelPeople({ channelId }: { channelId: string }) {
  const t = useTranslations('voice');
  const voice = useVoice();
  if (!voice) return null;
  const live = voice.channelId === channelId && voice.status === 'connected';
  const people = live
    ? voice.members
    : (voice.people[channelId] ?? []).map((p) => ({
        ...p,
        speaking: false,
        muted: false,
        me: false,
      }));
  if (!people.length) return null;
  const sharing = new Set(live ? voice.screens.map((s) => s.id) : []);
  return (
    <ul
      aria-label={t('inChannel', { count: people.length })}
      className="ms-[1.15rem] mb-1 flex flex-col border-s border-border/70 ps-1.5"
    >
      {people.map((p) => (
        <li
          key={p.id}
          className={cn(
            'flex items-center gap-2 rounded-ui-sm px-1.5 py-[3px] text-sm text-muted',
            p.speaking && 'text-fg',
          )}
        >
          <Avatar
            src={p.image}
            name={p.name}
            size={22}
            className={cn(
              'transition-shadow',
              p.speaking && 'ring-2 ring-success ring-offset-1 ring-offset-[var(--c-surface)]',
            )}
          />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.speaking && <span className="sr-only">{t('speaking')}</span>}
          {sharing.has(p.id) && (
            <span className="rounded bg-danger px-1 text-[10px] leading-4 font-bold text-white uppercase">
              {t('live')}
            </span>
          )}
          {p.me && voice.deafened ? (
            <HeadphoneOff
              aria-label={t('deafenedLabel')}
              role="img"
              className="size-3.5 text-danger"
            />
          ) : (
            p.muted && (
              <MicOff aria-label={t('micOff')} role="img" className="size-3.5 text-danger/90" />
            )
          )}
        </li>
      ))}
    </ul>
  );
}
