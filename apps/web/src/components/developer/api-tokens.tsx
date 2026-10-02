'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { createApiTokenAction, revokeApiTokenAction } from '@/app/actions/integrations';
import { formatDateTime } from '@/lib/format';
import { SecretBox } from './secret-box';

export interface TokenItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Personal API tokens: make one (shown once), see when each was used, delete them. */
export function ApiTokens({ tokens }: { tokens: TokenItem[] }) {
  const t = useTranslations('developer');
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [write, setWrite] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [created, setCreated] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await createApiTokenAction({ name, write });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    setCreated(r.data.token);
    setName('');
    setWrite(false);
    setFields({});
    router.refresh();
  }

  async function revoke(item: TokenItem) {
    if (!window.confirm(t('confirmRevoke', { name: item.name }))) return;
    setBusy(item.id);
    const r = await revokeApiTokenAction(item.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('revoked', { name: item.name }));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection id="token-new" title={t('newTitle')} description={t('newHint')}>
        {created && (
          <SecretBox
            title={t('createdTitle')}
            message={t('createdHint')}
            value={created}
            onDone={() => setCreated(null)}
          />
        )}
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          <FormError message={error} />
          <Field label={t('name')} description={t('nameHint')} error={fields.name}>
            {(p) => (
              <Input
                {...p}
                value={name}
                maxLength={60}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <SwitchField
            label={t('write')}
            description={t('writeHint')}
            checked={write}
            onCheckedChange={setWrite}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/developers" className="text-sm font-semibold text-primary underline">
              {t('docsLink')}
            </Link>
            <Button type="submit" loading={saving}>
              {t('create')}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection id="token-list" title={t('listTitle')}>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <KeyRound className="size-5 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {item.name}
                    <Badge tone={item.scopes.includes('write') ? 'warning' : 'neutral'}>
                      {item.scopes.includes('write') ? t('readWrite') : t('readOnly')}
                    </Badge>
                  </p>
                  <p className="text-sm text-muted" suppressHydrationWarning>
                    <code className="font-mono">{item.prefix}…</code> ·{' '}
                    {item.lastUsedAt
                      ? t('lastUsed', { when: formatDateTime(item.lastUsedAt, 'auto', locale) })
                      : t('neverUsed')}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={busy === item.id}
                  onClick={() => revoke(item)}
                  aria-label={t('revokeLabel', { name: item.name })}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t('revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
