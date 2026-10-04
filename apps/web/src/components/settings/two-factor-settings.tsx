'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { Download, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, Badge } from '@/components/ui/misc';
import { FormError } from '@/components/auth/form-error';
import { PROVIDER_LABELS, ProviderIcon } from '@/components/auth/provider-icons';
import { startSocialSignIn } from '@/components/auth/social-buttons';
import { authClient } from '@/lib/auth-client';
import { twoFactorError } from '@/lib/two-factor-errors';
import { cn } from '@/lib/utils';
import { SettingsSection } from './section';

type Stage =
  | { kind: 'idle' }
  | { kind: 'scan'; secret: string; qr: string; codes: string[] }
  | { kind: 'codes'; codes: string[]; justTurnedOn: boolean };

type AuthError = { code?: string; message?: string; status?: number };

/** A setup key in groups of four, easier to type into an app by hand. */
const grouped = (key: string) => key.match(/.{1,4}/g)?.join(' ') ?? key;

export function TwoFactorSettings({
  enabled,
  hasPassword,
  backupCodesLeft,
  providers,
  account,
}: {
  enabled: boolean;
  /** Without one (an account made with Discord, Google or Twitch), a code confirms changes. */
  hasPassword: boolean;
  backupCodesLeft: number;
  /** Sign-in providers linked to the account, to sign in again with. */
  providers: string[];
  /** Their username or email, to label the downloaded codes. */
  account: string;
}) {
  const t = useTranslations('security');
  const te = useTranslations('security.errors');
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>({ kind: 'idle' });
  const [confirming, setConfirming] = React.useState<'codes' | 'off' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [signInAgain, setSignInAgain] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const codeInput = React.useRef<HTMLInputElement>(null);

  const fail = (e: AuthError) => {
    if (e.code === 'SIGN_IN_AGAIN') setSignInAgain(true);
    else setError(twoFactorError(te, e));
  };

  /** The password, or (without one) the code, that confirms a change. */
  const proof = (form: HTMLFormElement) => {
    const value = String(new FormData(form).get('proof') ?? '');
    return hasPassword ? { password: value } : { code: value.replace(/\s/g, '') };
  };

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await authClient.twoFactor.enable(hasPassword ? proof(e.currentTarget) : {});
    setPending(false);
    if (r.error || !r.data || r.data.method !== 'totp') {
      fail(r.error ?? {});
      return;
    }
    const uri = r.data.totpURI;
    const secret = new URL(uri).searchParams.get('secret') ?? '';
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 200 });
    setStage({ kind: 'scan', secret, qr, codes: r.data.backupCodes });
  }

  async function finish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.kind !== 'scan') return;
    setError(null);
    setPending(true);
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s/g, '');
    const r = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (r.error) {
      fail(r.error);
      codeInput.current?.select();
      return;
    }
    setStage({ kind: 'codes', codes: stage.codes, justTurnedOn: true });
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const body = proof(e.currentTarget);
    if (confirming === 'codes') {
      const r = await authClient.twoFactor.generateBackupCodes(body);
      setPending(false);
      if (r.error || !r.data) return fail(r.error ?? {});
      setConfirming(null);
      setStage({ kind: 'codes', codes: r.data.backupCodes, justTurnedOn: false });
      toast.success(t('newCodesDone'));
    } else {
      const r = await authClient.twoFactor.disable(body);
      setPending(false);
      if (r.error) return fail(r.error);
      setConfirming(null);
      toast.success(t('turnedOff'));
      router.refresh();
    }
  }

  function done() {
    setStage({ kind: 'idle' });
    router.refresh();
  }

  const proofField = (
    <Field label={hasPassword ? t('confirmPassword') : t('confirmCode')} className="flex-1">
      {(p) =>
        hasPassword ? (
          <Input
            {...p}
            name="proof"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        ) : (
          <Input
            {...p}
            name="proof"
            autoComplete="one-time-code"
            spellCheck={false}
            required
            autoFocus
          />
        )
      }
    </Field>
  );

  const status = (
    <p className="flex items-center gap-2 text-sm font-semibold">
      {enabled ? (
        <ShieldCheck aria-hidden className="size-5 text-success" />
      ) : (
        <ShieldOff aria-hidden className="size-5 text-muted" />
      )}
      {t('status')}
      <Badge tone={enabled ? 'success' : 'neutral'}>
        {enabled ? t('statusOn') : t('statusOff')}
      </Badge>
    </p>
  );

  return (
    <SettingsSection id="2fa" title={t('twoFactor')} description={t('twoFactorIntro')}>
      {stage.kind === 'codes' ? (
        <BackupCodes
          codes={stage.codes}
          justTurnedOn={stage.justTurnedOn}
          account={account}
          onDone={done}
        />
      ) : stage.kind === 'scan' ? (
        <ol className="flex flex-col gap-6">
          <li className="flex flex-col gap-3">
            <StepHeading n={1} title={t('step1')} />
            <p className="text-sm text-muted">{t('step1Desc')}</p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stage.qr}
                alt={t('qrAlt')}
                width={200}
                height={200}
                className="shrink-0 rounded-ui border border-border bg-white p-2"
              />
              <details className="min-w-0 text-sm">
                <summary className="cursor-pointer font-semibold text-primary">
                  {t('cantScan')}
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-ui-sm bg-surface-2 px-2 py-1.5 font-mono text-sm tracking-wide break-all">
                    {grouped(stage.secret)}
                  </code>
                  <CopyButton
                    text={stage.secret}
                    label={t('copyKey')}
                    copiedLabel={t('copied')}
                    failedLabel={t('copyFailed')}
                  />
                </div>
              </details>
            </div>
          </li>
          <li className="flex flex-col gap-3">
            <StepHeading n={2} title={t('step2')} />
            <form onSubmit={finish} className="flex flex-col gap-3" noValidate>
              <FormError message={error} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label={t('enterCode')} className="sm:max-w-56">
                  {(p) => (
                    <Input
                      {...p}
                      ref={codeInput}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={7}
                      className="font-mono tracking-widest"
                      required
                    />
                  )}
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={pending}>
                    {t('turnOn')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setStage({ kind: 'idle' });
                    }}
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            </form>
          </li>
        </ol>
      ) : enabled ? (
        <>
          {status}
          <p className="text-sm">{t('onSummary')}</p>
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ui border px-4 py-3 text-sm',
              backupCodesLeft <= 3 ? 'border-warning/60 bg-warning/5' : 'border-border',
            )}
          >
            <KeyRound aria-hidden className="size-4 text-muted" />
            <span className="font-semibold">{t('codesLeft', { count: backupCodesLeft })}</span>
            {backupCodesLeft <= 3 && <span className="text-muted">{t('codesLow')}</span>}
          </div>
          {confirming ? (
            <form onSubmit={confirm} className="flex flex-col gap-3" noValidate>
              <p className="text-sm">
                <strong>{confirming === 'codes' ? t('newCodes') : t('turnOff')}.</strong>{' '}
                {confirming === 'codes' ? t('newCodesDesc') : t('turnOffDesc')}
              </p>
              <FormError message={error} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {proofField}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant={confirming === 'off' ? 'danger' : 'primary'}
                    loading={pending}
                  >
                    {confirming === 'codes' ? t('newCodesConfirm') : t('turnOffConfirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setConfirming(null);
                    }}
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setConfirming('codes')}>
                <KeyRound aria-hidden />
                {t('newCodes')}
              </Button>
              <Button variant="outline" onClick={() => setConfirming('off')}>
                <ShieldOff aria-hidden />
                {t('turnOff')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {status}
          <p className="text-sm text-muted">{t('apps')}</p>
          {signInAgain ? (
            <Alert tone="warning" title={t('signInAgainTitle')} live>
              <p>{t('signInAgainDesc')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {providers.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant="outline"
                    onClick={() => startSocialSignIn(p, '/settings/security#2fa')}
                  >
                    <ProviderIcon provider={p} className="size-4!" />
                    {t('signInWith', { provider: PROVIDER_LABELS[p] ?? p })}
                  </Button>
                ))}
              </div>
            </Alert>
          ) : (
            <form
              onSubmit={start}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
            >
              {hasPassword && (
                <div className="flex flex-1 flex-col gap-3">
                  <FormError message={error} />
                  <Field label={t('confirmPassword')}>
                    {(p) => (
                      <Input
                        {...p}
                        name="proof"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    )}
                  </Field>
                </div>
              )}
              {!hasPassword && error && <FormError message={error} />}
              <Button type="submit" loading={pending}>
                <ShieldCheck aria-hidden />
                {t('setUp')}
              </Button>
            </form>
          )}
        </>
      )}
    </SettingsSection>
  );
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2.5 font-semibold">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary"
      >
        {n}
      </span>
      {title}
    </h3>
  );
}

function BackupCodes({
  codes,
  justTurnedOn,
  account,
  onDone,
}: {
  codes: string[];
  justTurnedOn: boolean;
  account: string;
  onDone: () => void;
}) {
  const t = useTranslations('security');
  const text = codes.join('\n');
  const heading = React.useRef<HTMLHeadingElement>(null);
  // Move focus here, so keyboard and screen reader users land on what changed.
  React.useEffect(() => heading.current?.focus(), []);

  function download() {
    const file = [t('fileTitle', { account }), t('fileNote'), '', ...codes, ''].join('\r\n');
    const url = URL.createObjectURL(new Blob([file], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game-central-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {justTurnedOn && (
        <Alert tone="success" title={t('turnedOn')}>
          {t('turnedOnDesc')}
        </Alert>
      )}
      <div>
        <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">
          {t('saveCodes')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('saveCodesDesc')}</p>
      </div>
      <ul
        aria-label={t('saveCodes')}
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-ui border border-border bg-surface-2 p-4 font-mono text-sm sm:grid-cols-5"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton
          text={text}
          label={t('copyCodes')}
          copiedLabel={t('copied')}
          failedLabel={t('copyFailed')}
          className="h-10 border border-border px-4 text-sm"
        />
        <Button variant="outline" onClick={download}>
          <Download aria-hidden />
          {t('downloadCodes')}
        </Button>
        <Button onClick={onDone} className="ms-auto">
          {t('savedThem')}
        </Button>
      </div>
    </div>
  );
}
