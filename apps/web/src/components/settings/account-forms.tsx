'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, Badge } from '@/components/ui/misc';
import { authClient } from '@/lib/auth-client';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from './section';

const LABELS: Record<string, string> = { discord: 'Discord', google: 'Google', twitch: 'Twitch' };

export function AccountForms({
  user,
  providers,
}: {
  user: { name: string; email: string; emailVerified: boolean };
  providers: string[];
}) {
  const t = useTranslations('account');
  const router = useRouter();
  const [linked, setLinked] = React.useState<string[]>([]);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    authClient.listAccounts().then((r) => {
      if (r.data) setLinked(r.data.map((a) => a.providerId));
    });
  }, []);

  async function saveName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (name.length < 2 || name.length > 60) {
      setNameError('Use 2–60 characters.');
      return;
    }
    setPending('name');
    const r = await authClient.updateUser({ name });
    setPending(null);
    if (r.error) setNameError(r.error.message ?? 'Could not save');
    else {
      setNameError(null);
      toast.success(t('displayName'));
      router.refresh();
    }
  }

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newEmail = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setPending('email');
    const r = await authClient.changeEmail({ newEmail, callbackURL: '/settings/account' });
    setPending(null);
    if (r.error) setEmailError(r.error.message ?? 'Could not change email');
    else {
      setEmailError(null);
      toast.success(t('emailChangeSent'));
      router.refresh();
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('current') ?? '');
    const newPassword = String(data.get('new') ?? '');
    if (newPassword.length < 10) {
      setPwError('New password must be at least 10 characters.');
      return;
    }
    setPending('pw');
    const r = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(null);
    if (r.error) setPwError(r.error.message ?? 'Could not change password');
    else {
      setPwError(null);
      form.reset();
      toast.success(t('passwordChanged'));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection id="name" title={t('displayName')}>
        <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t('displayName')} error={nameError} className="flex-1" hideLabel>
            {(p) => (
              <Input
                {...p}
                name="name"
                defaultValue={user.name}
                maxLength={60}
                autoComplete="nickname"
              />
            )}
          </Field>
          <Button type="submit" loading={pending === 'name'}>
            {t('saveName')}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection id="email" title={t('email')}>
        {!user.emailVerified && (
          <Alert tone="warning" title={t('emailUnverified')}>
            <Button
              variant="link"
              onClick={async () => {
                await authClient.sendVerificationEmail({
                  email: user.email,
                  callbackURL: '/settings/account',
                });
                toast.success(t('verificationSent'));
              }}
            >
              {t('resendVerification')}
            </Button>
          </Alert>
        )}
        <form onSubmit={changeEmail} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t('email')} error={emailError} className="flex-1" hideLabel>
            {(p) => (
              <Input
                {...p}
                name="email"
                type="email"
                defaultValue={user.email}
                autoComplete="email"
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={pending === 'email'}>
            {t('changeEmail')}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection id="password" title={t('password')}>
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <FormError message={pwError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('currentPassword')}>
              {(p) => (
                <Input
                  {...p}
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>
            <Field label={t('newPassword')}>
              {(p) => (
                <Input
                  {...p}
                  name="new"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="secondary" loading={pending === 'pw'}>
              {t('changePassword')}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection id="connections" title={t('connections')} description={t('connectionsDesc')}>
        {providers.length === 0 ? (
          <p className="text-sm text-muted">{t('noProviders')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {providers.map((p) => (
              <li key={p} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{LABELS[p] ?? p}</span>
                {linked.includes(p) ? (
                  <Badge tone="success">{t('connected')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      authClient.linkSocial({
                        provider: p as 'discord' | 'google' | 'twitch',
                        callbackURL: '/settings/account',
                      })
                    }
                  >
                    {t('connect', { provider: LABELS[p] ?? p })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
