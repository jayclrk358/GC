'use client';

import Link from '@/components/ui/link';
import { useTranslations } from 'next-intl';
import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Signal,
} from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useVoice } from '@/components/voice/voice-provider';
import { cn } from '@/lib/utils';

export interface PanelUser {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
}

/**
 * The bottom of the channel list: the call you're in (like Discord's "Voice Connected"), then
 * you, with mute, deafen and settings.
 */
export function UserPanel({
  slug,
  communityName,
  user,
}: {
  slug: string;
  communityName: string;
  user: PanelUser | null;
}) {
  const t = useTranslations('voice');
  const tc = useTranslations('chat');
  const voice = useVoice();
  const inCall = Boolean(voice && voice.status !== 'idle' && voice.channelName);

  return (
    <div className="border-t border-border/60 bg-rail-deep">
      {inCall && voice && (
        <aside aria-label={t('barLabel')} className="border-b border-border/60 px-2 pt-2 pb-2">
          <div className="flex items-center gap-2">
            <Signal
              aria-hidden
              className={cn(
                'size-5 shrink-0',
                voice.status === 'connected' ? 'text-success' : 'text-warning',
              )}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p
                className={cn(
                  'text-sm font-bold',
                  voice.status === 'connected' ? 'text-success' : 'text-warning',
                )}
              >
                {voice.status === 'connected' ? t('connected') : t('connecting')}
              </p>
              <Link
                href={`/c/${slug}/chat/${voice.channelName}`}
                className="block truncate text-xs text-muted hover:text-fg hover:underline"
              >
                {voice.channelName} / {communityName}
              </Link>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('leave')}
              title={t('leave')}
              onClick={voice.leave}
              className="text-muted hover:text-danger"
            >
              <PhoneOff aria-hidden />
            </Button>
          </div>
          {voice.canShare && voice.status === 'connected' && (
            <Button
              size="sm"
              variant={voice.sharing ? 'secondary' : 'outline'}
              aria-pressed={voice.sharing}
              onClick={voice.toggleShare}
              className="mt-2 w-full"
            >
              {voice.sharing ? <MonitorOff aria-hidden /> : <MonitorUp aria-hidden />} {t('share')}
            </Button>
          )}
        </aside>
      )}
      {user ? (
        <div className="flex items-center gap-1 px-2 py-1.5">
          <Link
            href={user.username ? `/u/${user.username}` : '/settings/profile'}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-ui-sm px-1 py-1 hover:bg-fg/[0.07]"
          >
            <Avatar src={user.image} name={user.name} size={32} presence={user.id} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">{user.name}</span>
              {user.username && (
                <span className="block truncate text-xs text-muted">@{user.username}</span>
              )}
            </span>
          </Link>
          {voice && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-pressed={voice.muted}
                aria-label={t('mute')}
                title={t('mute')}
                onClick={voice.toggleMute}
                className={cn(voice.muted && 'text-danger')}
              >
                {voice.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-pressed={voice.deafened}
                aria-label={t('deafen')}
                title={t('deafen')}
                onClick={voice.toggleDeafen}
                className={cn(voice.deafened && 'text-danger')}
              >
                {voice.deafened ? <HeadphoneOff aria-hidden /> : <Headphones aria-hidden />}
              </Button>
            </>
          )}
          <Button asChild size="icon-sm" variant="ghost">
            <Link href="/settings" aria-label={tc('userSettings')} title={tc('userSettings')}>
              <Settings aria-hidden />
            </Link>
          </Button>
        </div>
      ) : (
        <p className="px-3 py-3 text-sm text-muted">
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/c/${slug}/chat`)}`}
            className="font-semibold text-primary hover:underline"
          >
            {tc('signIn')}
          </Link>{' '}
          {tc('signInToTalk')}
        </p>
      )}
    </div>
  );
}
