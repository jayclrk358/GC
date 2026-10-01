'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  UserX,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { PlanLock } from '@/components/billing/plan-lock';
import { moderateVoiceAction } from '@/app/actions/voice';
import { cn } from '@/lib/utils';
import { useVoice, type VoiceScreen } from './voice-provider';

/** Why someone can't join, if they can't. */
export type VoiceBlock = 'signedOut' | 'notMember' | 'noPermission' | 'notSetUp' | 'needsPlan';

/** A voice channel: who's there (and talking), joining and leaving, and the call's controls. */
export function VoiceView({
  channel,
  slug,
  blocked,
  canModerate,
}: {
  channel: { id: string; name: string; topic: string };
  slug: string;
  blocked: VoiceBlock | null;
  /** Mute members: can mute others or take them out of the call. */
  canModerate: boolean;
}) {
  const t = useTranslations('voice');
  const voice = useVoice();
  const [announce, setAnnounce] = React.useState('');
  if (!voice) return null;
  const here = voice.channelId === channel.id;
  const connected = here && voice.status === 'connected';
  const people = connected
    ? voice.members
    : (voice.people[channel.id] ?? []).map((p) => ({
        ...p,
        speaking: false,
        muted: false,
        me: false,
      }));

  async function moderate(userId: string, name: string, action: 'mute' | 'disconnect') {
    const r = await moderateVoiceAction(voice!.communityId, channel.id, userId, action);
    if (!r.ok) toast.error(r.error);
    else toast.success(t(action === 'mute' ? 'mutedOther' : 'removedOther', { name }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border/70 px-4 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <h2 className="flex min-w-0 items-center gap-1.5 text-base font-bold">
          <Volume2 aria-hidden className="size-6 shrink-0 text-muted" />
          <span className="truncate">{channel.name}</span>
          <span className="sr-only"> {t('voiceChannel')}</span>
        </h2>
        {channel.topic && (
          <>
            <span aria-hidden className="mx-1 h-6 w-px bg-border" />
            <p className="min-w-0 flex-1 truncate text-sm text-muted">{channel.topic}</p>
          </>
        )}
      </header>
      <p role="status" className="sr-only">
        {announce}
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {connected && voice.screens.length > 0 && (
          <section aria-label={t('screens')} className="grid gap-3 lg:grid-cols-2">
            {voice.screens.map((s) => (
              <ScreenTile key={s.id} screen={s} label={t('screenOf', { name: s.name })} />
            ))}
          </section>
        )}

        {people.length ? (
          <ul
            aria-label={t('inChannel', { count: people.length })}
            className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3"
          >
            {people.map((p) => (
              // A video-call tile: dark, the avatar in the middle, the name in the corner, and a
              // green outline while they talk.
              <li
                key={p.id}
                className={cn(
                  'group relative flex aspect-video flex-col items-center justify-center rounded-ui-lg border-2 border-transparent bg-rail-deep transition-colors',
                  p.speaking && 'border-success',
                )}
              >
                <Avatar
                  src={p.image}
                  name={p.name}
                  size={80}
                  className={cn(
                    'transition-shadow',
                    p.speaking && 'ring-4 ring-success ring-offset-4 ring-offset-[var(--c-bg)]',
                  )}
                />
                <p className="absolute start-2 bottom-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-ui-sm bg-black/60 px-2 py-0.5 text-sm font-semibold text-white">
                  {p.muted && (
                    <MicOff aria-label={t('micOff')} role="img" className="size-3.5 text-red-300" />
                  )}
                  <span className="truncate">{p.me ? t('you', { name: p.name }) : p.name}</span>
                </p>
                {p.speaking && <span className="sr-only">{t('speaking')}</span>}
                {connected && canModerate && !p.me && (
                  <div className="absolute end-2 top-2 flex gap-1 rounded-ui bg-surface/90 p-0.5 opacity-0 shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('muteOther', { name: p.name })}
                      title={t('muteOther', { name: p.name })}
                      onClick={() => void moderate(p.id, p.name, 'mute')}
                    >
                      <MicOff aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('removeOther', { name: p.name })}
                      title={t('removeOther', { name: p.name })}
                      onClick={() => void moderate(p.id, p.name, 'disconnect')}
                    >
                      <UserX aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t('empty')}</p>
        )}
      </div>

      <footer
        role="group"
        aria-label={t('callControls')}
        className="flex flex-wrap items-center justify-center gap-2 border-t border-border/70 bg-rail p-3"
      >
        {blocked ? (
          <Blocked reason={blocked} slug={slug} />
        ) : !here || voice.status === 'idle' ? (
          <Button
            onClick={async () => {
              await voice.join(channel.id, channel.name);
              setAnnounce(t('joinedAnnounce', { name: channel.name }));
            }}
          >
            <Volume2 aria-hidden /> {t('join')}
          </Button>
        ) : (
          <>
            {voice.status === 'connecting' && (
              <p role="status" className="text-sm text-muted">
                {t('connecting')}
              </p>
            )}
            {voice.canSpeak && (
              <Button
                variant={voice.muted ? 'secondary' : 'outline'}
                aria-pressed={voice.muted}
                onClick={voice.toggleMute}
              >
                {voice.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />} {t('mute')}
              </Button>
            )}
            <Button
              variant={voice.deafened ? 'secondary' : 'outline'}
              aria-pressed={voice.deafened}
              onClick={voice.toggleDeafen}
            >
              {voice.deafened ? <HeadphoneOff aria-hidden /> : <Headphones aria-hidden />}{' '}
              {t('deafen')}
            </Button>
            {voice.canShare && (
              <Button
                variant={voice.sharing ? 'secondary' : 'outline'}
                aria-pressed={voice.sharing}
                onClick={voice.toggleShare}
              >
                {voice.sharing ? <MonitorOff aria-hidden /> : <MonitorUp aria-hidden />}{' '}
                {t('share')}
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                voice.leave();
                setAnnounce(t('leftAnnounce'));
              }}
            >
              <PhoneOff aria-hidden /> {t('leave')}
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

function Blocked({ reason, slug }: { reason: VoiceBlock; slug: string }) {
  const t = useTranslations('voice');
  if (reason === 'needsPlan') {
    return <PlanLock plan="plus" slug={slug} what={t('needsPlanWhat')} />;
  }
  if (reason === 'signedOut') {
    return (
      <p className="text-sm text-muted">
        <Link href="/sign-in" className="font-semibold text-primary underline">
          {t('signIn')}
        </Link>{' '}
        {t('signInToTalk')}
      </p>
    );
  }
  return <p className="text-sm text-muted">{t(`blocked.${reason}`)}</p>;
}

/** Someone's shared screen. */
function ScreenTile({ screen, label }: { screen: VoiceScreen; label: string }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    screen.track.attach(el);
    return () => {
      screen.track.detach(el);
    };
  }, [screen.track]);
  return (
    <figure className="overflow-hidden rounded-ui-lg border border-border bg-black">
      <video ref={ref} aria-label={label} muted playsInline className="aspect-video w-full" />
      <figcaption className="bg-surface-2 px-2 py-1 text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
