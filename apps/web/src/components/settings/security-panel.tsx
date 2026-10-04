'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { SettingsSection } from './section';
import { TwoFactorSettings } from './two-factor-settings';

interface SessionRow {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
}

function describeAgent(ua?: string | null): string {
  if (!ua) return '';
  const browser = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' on ');
}

export function SecurityPanel({
  twoFactor,
  currentSessionToken,
}: {
  twoFactor: React.ComponentProps<typeof TwoFactorSettings>;
  currentSessionToken: string;
}) {
  const t = useTranslations('security');
  const locale = useLocale();
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);

  const loadSessions = React.useCallback(() => {
    authClient.listSessions().then((r) => setSessions((r.data as SessionRow[] | null) ?? []));
  }, []);
  React.useEffect(loadSessions, [loadSessions]);

  return (
    <div className="flex flex-col gap-6">
      <TwoFactorSettings {...twoFactor} />

      <SettingsSection id="sessions" title={t('sessions')} description={t('sessionsDesc')}>
        <ul className="divide-y divide-border rounded-ui border border-border">
          {sessions.map((s) => {
            const current = s.token === currentSessionToken;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-semibold">
                    {describeAgent(s.userAgent) || t('unknownDevice')}{' '}
                    {current && <Badge tone="primary">{t('thisDevice')}</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {t('lastActive', { date: new Date(s.createdAt).toLocaleString(locale) })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                  </p>
                </div>
                {!current && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await authClient.revokeSession({ token: s.token });
                      loadSessions();
                    }}
                  >
                    {t('revoke')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {sessions.length > 1 && (
          <div>
            <Button
              variant="secondary"
              onClick={async () => {
                await authClient.revokeOtherSessions();
                loadSessions();
              }}
            >
              {t('revokeOthers')}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
