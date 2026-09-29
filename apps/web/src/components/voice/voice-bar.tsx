'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoice } from './voice-provider';

/**
 * While you're in a call and looking at something else: a strip above the page with which
 * channel, and quick controls.
 * (The voice channel's own page has the full controls.)
 */
export function VoiceBar({ slug }: { slug: string }) {
  const t = useTranslations('voice');
  const voice = useVoice();
  const pathname = usePathname();
  if (!voice || voice.status === 'idle' || !voice.channelName) return null;
  const href = `/c/${slug}/chat/${voice.channelName}`;
  if (pathname === href) return null;
  return (
    <aside
      aria-label={t('barLabel')}
      // In the page (not floating) so it never covers the chat box or anything else.
      className="mb-3 flex shrink-0 items-center gap-2 rounded-ui-lg border border-border bg-surface p-1.5 group-data-[dense=true]/dense:mb-2"
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-ui px-2 py-1 text-sm hover:bg-surface-2"
      >
        <Volume2 aria-hidden className="size-4 shrink-0 text-success" />
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-success">
            {voice.status === 'connecting' ? t('connecting') : t('connected')}
          </span>
          <span className="block truncate font-semibold">{voice.channelName}</span>
        </span>
      </Link>
      {voice.canSpeak && (
        <Button
          size="icon-sm"
          variant={voice.muted ? 'secondary' : 'ghost'}
          aria-pressed={voice.muted}
          aria-label={t('mute')}
          title={t('mute')}
          onClick={voice.toggleMute}
        >
          {voice.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
        </Button>
      )}
      <Button
        size="icon-sm"
        variant={voice.deafened ? 'secondary' : 'ghost'}
        aria-pressed={voice.deafened}
        aria-label={t('deafen')}
        title={t('deafen')}
        onClick={voice.toggleDeafen}
      >
        {voice.deafened ? <HeadphoneOff aria-hidden /> : <Headphones aria-hidden />}
      </Button>
      <Button
        size="icon-sm"
        variant="danger"
        aria-label={t('leave')}
        title={t('leave')}
        onClick={voice.leave}
      >
        <PhoneOff aria-hidden />
      </Button>
    </aside>
  );
}
