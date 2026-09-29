'use client';

import { useTranslations } from 'next-intl';
import { MicOff } from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useVoice } from './voice-provider';

/** Who's in a voice channel, under its name in the channel list. */
export function VoiceChannelPeople({ channelId }: { channelId: string }) {
  const t = useTranslations('voice');
  const voice = useVoice();
  if (!voice) return null;
  // In the call yourself: the live roster (with who's talking); otherwise the server's list.
  const live = voice.channelId === channelId && voice.status === 'connected';
  const people = live
    ? voice.members
    : (voice.people[channelId] ?? []).map((p) => ({ ...p, speaking: false, muted: false }));
  if (!people.length) return null;
  return (
    <ul aria-label={t('inChannel', { count: people.length })} className="ms-6 mb-1 flex flex-col">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-1.5 px-2 py-0.5 text-sm text-muted">
          <Avatar
            src={p.image}
            name={p.name}
            size={20}
            className={cn(p.speaking && 'ring-2 ring-success ring-offset-1 ring-offset-surface')}
          />
          <span className={cn('min-w-0 flex-1 truncate', p.speaking && 'text-fg')}>{p.name}</span>
          {p.speaking && <span className="sr-only">{t('speaking')}</span>}
          {p.muted && <MicOff aria-label={t('micOff')} role="img" className="size-3.5" />}
        </li>
      ))}
    </ul>
  );
}
