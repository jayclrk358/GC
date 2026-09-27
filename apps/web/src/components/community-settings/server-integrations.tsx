'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ServerIntegrationsView } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Alert, Spinner } from '@/components/ui/misc';
import { FormError } from '@/components/auth/form-error';
import {
  getServerIntegrationsAction,
  testVotifierAction,
  updateServerIntegrationsAction,
} from '@/app/actions/servers';

/** Chat alerts and Votifier settings for one server, loaded when the dialog opens. */
export function ServerIntegrationsForm({
  communityId,
  serverId,
  minecraft,
  onSaved,
}: {
  communityId: string;
  serverId: string;
  minecraft: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations('serverSettings');
  const [data, setData] = React.useState<ServerIntegrationsView | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [alertChannelId, setAlertChannelId] = React.useState('');
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState('8192');
  const [mode, setMode] = React.useState<'v2' | 'v1'>('v2');
  const [token, setToken] = React.useState('');
  const [publicKey, setPublicKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [testName, setTestName] = React.useState('');
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void getServerIntegrationsAction(communityId, serverId).then((r) => {
      if (!live) return;
      if (!r.ok) return setLoadError(r.error);
      setData(r.data);
      setAlertChannelId(r.data.alertChannelId ?? '');
      setHost(r.data.votifierHost ?? '');
      setPort(String(r.data.votifierPort ?? 8192));
      setMode(r.data.hasVotifierKey && !r.data.hasVotifierToken ? 'v1' : 'v2');
    });
    return () => {
      live = false;
    };
  }, [communityId, serverId]);

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;
  if (!data)
    return (
      <div className="grid place-items-center p-6">
        <Spinner label={t('loading')} />
      </div>
    );

  const savedSecret = mode === 'v2' ? data.hasVotifierToken : data.hasVotifierKey;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await updateServerIntegrationsAction(communityId, serverId, {
          alertChannelId: alertChannelId || null,
          votifierHost: minecraft ? host.trim() : '',
          votifierPort: minecraft && host.trim() ? Number(port) || 8192 : null,
          votifierToken: mode === 'v2' ? token.trim() : '',
          votifierPublicKey: mode === 'v1' ? publicKey.trim() : '',
        });
        setPending(false);
        if (!r.ok) {
          setError(r.error);
          setFields(r.fields ?? {});
          return;
        }
        toast.success(t('saved'));
        onSaved();
      }}
    >
      <FormError message={error} />
      <fieldset className="flex flex-col gap-3">
        <legend className="font-bold">{t('alertsTitle')}</legend>
        <p className="text-sm text-muted">{t('alertsDesc')}</p>
        <Field label={t('alertChannel')} error={fields.alertChannelId}>
          {(p) => (
            <Select
              {...p}
              value={alertChannelId}
              onChange={(e) => setAlertChannelId(e.target.value)}
            >
              <option value="">{t('alertsOff')}</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>

      {minecraft && (
        <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
          <legend className="float-left mb-1 w-full font-bold">{t('votifierTitle')}</legend>
          <p className="text-sm text-muted">{t('votifierDesc')}</p>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field
              label={t('votifierHost')}
              description={t('votifierHostHint')}
              error={fields.votifierHost}
            >
              {(p) => (
                <Input
                  {...p}
                  value={host}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="play.example.com"
                  onChange={(e) => setHost(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('votifierPort')} error={fields.votifierPort}>
              {(p) => (
                <Input
                  {...p}
                  value={port}
                  inputMode="numeric"
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              )}
            </Field>
          </div>
          <Field label={t('votifierVersion')}>
            {(p) => (
              <Select
                {...p}
                value={mode}
                onChange={(e) => setMode(e.target.value === 'v1' ? 'v1' : 'v2')}
              >
                <option value="v2">{t('votifierV2')}</option>
                <option value="v1">{t('votifierV1')}</option>
              </Select>
            )}
          </Field>
          {mode === 'v2' ? (
            <Field
              label={t('votifierToken')}
              description={savedSecret ? t('secretSaved') : t('votifierTokenHint')}
              error={fields.votifierToken}
            >
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              )}
            </Field>
          ) : (
            <Field
              label={t('votifierKey')}
              description={savedSecret ? t('secretSaved') : t('votifierKeyHint')}
              error={fields.votifierPublicKey ?? fields.votifierToken}
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={publicKey}
                  spellCheck={false}
                  className="font-mono text-xs"
                  onChange={(e) => setPublicKey(e.target.value)}
                />
              )}
            </Field>
          )}
          {data.votifierHost && (
            <div className="flex flex-col gap-2 rounded-ui border border-border p-3">
              <p className="text-sm font-semibold">{t('testVote')}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Field label={t('testVoteName')}>
                    {(p) => (
                      <Input
                        {...p}
                        value={testName}
                        maxLength={16}
                        autoCapitalize="none"
                        spellCheck={false}
                        onChange={(e) => setTestName(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  loading={testing}
                  onClick={async () => {
                    setTesting(true);
                    const r = await testVotifierAction(communityId, serverId, testName.trim());
                    setTesting(false);
                    if (r.ok) toast.success(t('testVoteSent'));
                    else toast.error(r.error);
                  }}
                >
                  {t('testVoteSend')}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          {t('saveSettings')}
        </Button>
      </div>
    </form>
  );
}
