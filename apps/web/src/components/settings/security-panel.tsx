'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, Badge } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from './section';

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
  twoFactorEnabled,
  currentSessionToken,
}: {
  twoFactorEnabled: boolean;
  currentSessionToken: string;
}) {
  const t = useTranslations('security');
  const locale = useLocale();
  const router = useRouter();
  const [setup, setSetup] = React.useState<{
    uri: string;
    secret: string;
    qr: string;
    backupCodes: string[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);

  const loadSessions = React.useCallback(() => {
    authClient.listSessions().then((r) => setSessions((r.data as SessionRow[] | null) ?? []));
  }, []);
  React.useEffect(loadSessions, [loadSessions]);

  async function enable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    const r = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (r.error || !r.data || r.data.method !== 'totp') {
      setError(r.error?.message ?? 'Could not start setup');
      return;
    }
    const uri = r.data.totpURI;
    const secret = new URL(uri).searchParams.get('secret') ?? '';
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    setSetup({ uri, secret, qr, backupCodes: r.data.backupCodes });
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s/g, '');
    const r = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (r.error) {
      setError(r.error.message ?? 'Invalid code');
      return;
    }
    toast.success(t('twoFactorOn'));
    router.refresh();
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    const r = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (r.error) setError(r.error.message ?? 'Could not turn off');
    else {
      setSetup(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        id="2fa"
        title={t('twoFactor')}
        description={twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')}
      >
        <FormError message={error} />
        {twoFactorEnabled ? (
          <form onSubmit={disable} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={t('confirmPassword')} className="flex-1">
              {(p) => (
                <Input
                  {...p}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>
            <Button type="submit" variant="danger" loading={pending}>
              {t('disable')}
            </Button>
          </form>
        ) : setup ? (
          <div className="flex flex-col gap-4">
            <p>{t('scan')}</p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qr}
                alt="QR code for your authenticator app"
                width={220}
                height={220}
                className="rounded-ui bg-white p-2"
              />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-semibold">{t('setupKey')}</p>
                <code className="rounded-ui bg-surface-2 p-2 font-mono text-sm break-all">
                  {setup.secret}
                </code>
                <Alert tone="info" title={t('backupCodes')}>
                  <p>{t('backupCodesDesc')}</p>
                  <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
                    {setup.backupCodes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            </div>
            <form onSubmit={verify} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={t('enterCode')} className="flex-1">
                {(p) => (
                  <Input
                    {...p}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                  />
                )}
              </Field>
              <Button type="submit" loading={pending}>
                {t('finish')}
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={enable} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={t('confirmPassword')} className="flex-1">
              {(p) => (
                <Input
                  {...p}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>
            <Button type="submit" loading={pending}>
              {t('enable')}
            </Button>
          </form>
        )}
      </SettingsSection>

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
