'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Turnstile, type TurnstileHandle } from '@/components/ui/turnstile';
import { acceptTermsAction } from '@/app/actions/account';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-redirect';
import { captchaOptions, isCaptchaError } from './captcha';
import { FormError } from './form-error';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export function SignUpForm({
  next,
  turnstileSiteKey,
}: {
  next: string;
  turnstileSiteKey: string | null;
}) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [verifySent, setVerifySent] = React.useState(false);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const turnstile = React.useRef<TurnstileHandle>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const username = String(form.get('username') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    const errs: Record<string, string> = {};
    if (name.length < 2) errs.name = 'Enter a display name (at least 2 characters).';
    if (!USERNAME_RE.test(username)) errs.username = t('usernameHint');
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (password.length < 10) errs.password = t('passwordHint');
    if (form.get('terms') !== 'on') errs.terms = t('termsRequired');
    setFields(errs);
    if (Object.keys(errs).length) {
      setError('Please fix the highlighted fields.');
      return;
    }
    if (turnstileSiteKey && !captcha) {
      setError(t('captchaRequired'));
      return;
    }

    setPending(true);
    const res = await authClient.signUp.email({
      name,
      email,
      password,
      username,
      callbackURL: safeNext(next),
      fetchOptions: captchaOptions(captcha),
    });
    setPending(false);
    if (res.error) {
      // Each token works once, so every failed attempt needs a fresh check.
      turnstile.current?.reset();
      if (isCaptchaError(res.error)) {
        setError(t('captchaFailed'));
        return;
      }
      const msg = res.error.message ?? 'Could not create your account.';
      if (/username/i.test(msg)) setFields({ username: msg });
      else if (/email|user already exists/i.test(msg)) setFields({ email: msg });
      setError(msg);
      return;
    }
    if (!res.data?.token) {
      // They agree to the terms when they first sign in (after confirming their email).
      setVerifySent(true);
      return;
    }
    await acceptTermsAction();
    const to = safeNext(next);
    router.push(to === '/' ? '/new?welcome=1' : to);
    router.refresh();
  }

  if (verifySent) {
    return (
      <Alert tone="success" live title={t('verifyEmailSent')}>
        {t('verifyEmailSent')}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <Field label={t('name')} description={t('nameHint')} error={fields.name} required>
        {(p) => (
          <Input {...p} name="name" autoComplete="nickname" maxLength={60} required autoFocus />
        )}
      </Field>
      <Field label={t('username')} description={t('usernameHint')} error={fields.username} required>
        {(p) => (
          <Input
            {...p}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            required
          />
        )}
      </Field>
      <Field label={t('email')} error={fields.email} required>
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}
      </Field>
      <Field label={t('password')} description={t('passwordHint')} error={fields.password} required>
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        )}
      </Field>
      {turnstileSiteKey && (
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          action="sign-up"
          onToken={setCaptcha}
        />
      )}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 size-4 accent-[var(--c-primary)]"
            aria-invalid={fields.terms ? true : undefined}
            aria-describedby={fields.terms ? 'terms-error' : undefined}
          />
          <span>
            {t.rich('termsAgree', {
              terms: (c) => (
                <Link href="/legal/terms" target="_blank" className="text-primary underline">
                  {c}
                </Link>
              ),
              privacy: (c) => (
                <Link href="/legal/privacy" target="_blank" className="text-primary underline">
                  {c}
                </Link>
              ),
            })}
          </span>
        </label>
        {fields.terms && (
          <p id="terms-error" className="text-sm font-medium text-danger">
            {fields.terms}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" loading={pending}>
        {t('signUpCta')}
      </Button>
    </form>
  );
}
