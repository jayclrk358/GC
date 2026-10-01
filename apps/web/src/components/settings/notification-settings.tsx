'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwitchField } from '@/components/ui/switch';
import { formatDateTime } from '@/lib/format';
import { setMuteAction, updateNotificationSettingsAction } from '@/app/actions/notifications';

interface Settings {
  emailMentions: boolean;
  emailReplies: boolean;
  emailModeration: boolean;
  emailEvents: boolean;
  autoFollow: boolean;
}

export function NotificationSettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslations('notifications');
  const [s, setS] = React.useState(initial);
  const [status, setStatus] = React.useState('');

  async function change(key: keyof Settings, value: boolean) {
    const next = { ...s, [key]: value };
    setS(next);
    const r = await updateNotificationSettingsAction(next);
    if (r.ok) setStatus(t('saved'));
    else {
      setS(s);
      toast.error(r.error);
    }
  }

  return (
    <section
      aria-labelledby="notif-email-h"
      className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-5"
    >
      <h2 id="notif-email-h" className="text-lg font-bold">
        {t('emailTitle')}
      </h2>
      <p className="text-sm text-muted">{t('emailDescription')}</p>
      <div className="divide-y divide-border">
        <SwitchField
          label={t('emailMentions')}
          description={t('emailMentionsHint')}
          checked={s.emailMentions}
          onCheckedChange={(v) => void change('emailMentions', v)}
        />
        <SwitchField
          label={t('emailReplies')}
          description={t('emailRepliesHint')}
          checked={s.emailReplies}
          onCheckedChange={(v) => void change('emailReplies', v)}
        />
        <SwitchField
          label={t('emailModeration')}
          description={t('emailModerationHint')}
          checked={s.emailModeration}
          onCheckedChange={(v) => void change('emailModeration', v)}
        />
        <SwitchField
          label={t('emailEvents')}
          description={t('emailEventsHint')}
          checked={s.emailEvents}
          onCheckedChange={(v) => void change('emailEvents', v)}
        />
      </div>
      <h2 className="mt-4 text-lg font-bold">{t('followingTitle')}</h2>
      <SwitchField
        label={t('autoFollow')}
        description={t('autoFollowHint')}
        checked={s.autoFollow}
        onCheckedChange={(v) => void change('autoFollow', v)}
      />
      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  );
}

export interface MuteRow {
  targetType: 'community' | 'channel' | 'thread';
  targetId: string;
  label: string;
  community: string | null;
  href: string | null;
  until: string | null;
}

export function MuteList({ mutes }: { mutes: MuteRow[] }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  return (
    <section
      aria-labelledby="mutes-h"
      className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-5"
    >
      <h2 id="mutes-h" className="text-lg font-bold">
        {t('mutedTitle')}
      </h2>
      <p className="text-sm text-muted">{t('mutedDescription')}</p>
      {mutes.length === 0 ? (
        <p className="text-sm text-muted">{t('mutedEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {mutes.map((m) => (
            <li
              key={`${m.targetType}-${m.targetId}`}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <BellOff className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  {m.href ? (
                    <Link href={m.href} className="font-semibold hover:underline">
                      {m.label}
                    </Link>
                  ) : (
                    <span className="font-semibold">{m.label}</span>
                  )}
                  <span className="block text-xs text-muted">
                    {t(`muteKinds.${m.targetType}`)}
                    {m.community && ` · ${m.community}`}
                    {' · '}
                    {m.until
                      ? t('mutedUntil', { date: formatDateTime(m.until) })
                      : t('mutedForever')}
                  </span>
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={t('unmuteNamed', { name: m.label })}
                onClick={async () => {
                  const r = await setMuteAction(
                    { targetType: m.targetType, targetId: m.targetId },
                    false,
                  );
                  if (r.ok) {
                    toast.success(t('unmuted'));
                    router.refresh();
                  } else toast.error(r.error);
                }}
              >
                {t('unmute')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
