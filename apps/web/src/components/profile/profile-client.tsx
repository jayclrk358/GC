'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { usePrefs } from '@/components/shell/prefs-provider';

// A minute-resolution clock shared by every LocalTime on the page. The server renders nothing
// (it can't know the viewer's "now"), so there's no hydration mismatch.
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 15_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const serverNow = () => null;

/** The person's current local time, kept up to date. */
export function LocalTime({ timeZone }: { timeZone: string }) {
  const t = useTranslations('profile');
  const { prefs } = usePrefs();
  const minute = React.useSyncExternalStore(subscribe, minuteNow, serverNow);
  if (minute === null) return null;
  const fmt = new Intl.DateTimeFormat('en', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    weekday: 'short',
    timeZoneName: 'shortOffset',
    hour12: prefs.timeFormat === 'auto' ? undefined : prefs.timeFormat === '12h',
  });
  return <span>{t('localTime', { time: fmt.format(new Date(minute * 60_000)) })}</span>;
}

/** A game account without a public page: show the handle with a button to copy it. */
export function CopyHandle({ service, handle }: { service: string; handle: string }) {
  const t = useTranslations('profile');
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(handle);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={t('copyAccount', { service, handle })}
      className="mx-press group inline-flex min-w-0 items-center gap-1.5 rounded-ui-sm px-1 font-mono text-sm hover:bg-surface-2"
    >
      <span className="truncate">{handle}</span>
      {copied ? (
        <Check aria-hidden className="size-3.5 shrink-0 text-success" />
      ) : (
        <Copy aria-hidden className="size-3.5 shrink-0 text-muted group-hover:text-fg" />
      )}
      <span role="status" className="sr-only">
        {copied ? t('copied', { service }) : ''}
      </span>
    </button>
  );
}
