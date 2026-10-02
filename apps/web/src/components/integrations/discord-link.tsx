'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import {
  removeDiscordLinkAction,
  saveDiscordLinkAction,
  syncDiscordAction,
} from '@/app/actions/integrations';
import { formatDateTime } from '@/lib/format';

export interface DiscordLinkData {
  botReady: boolean;
  inviteUrl: string | null;
  guildId: string | null;
  roleMap: Record<string, string>;
  lastSyncAt: string | null;
  lastSyncResult: string | null;
  roles: { id: string; name: string; color: string | null }[];
}

/** Link the community's Discord server and match roles, so members get Discord roles too. */
export function DiscordLink({ communityId, data }: { communityId: string; data: DiscordLinkData }) {
  const t = useTranslations('discord');
  const router = useRouter();
  const [guildId, setGuildId] = React.useState(data.guildId ?? '');
  const [map, setMap] = React.useState<Record<string, string>>(data.roleMap);
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<'sync' | 'remove' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  if (!data.botReady) {
    return (
      <SettingsSection id="discord" title={t('title')} description={t('description')}>
        <p className="text-sm text-muted">{t('notSetUp')}</p>
      </SettingsSection>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const roleMap = Object.fromEntries(
      Object.entries(map)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v),
    );
    const r = await saveDiscordLinkAction(communityId, { guildId, roleMap });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    setFields({});
    toast.success(t('saved'));
    router.refresh();
  }

  async function sync() {
    setBusy('sync');
    const r = await syncDiscordAction(communityId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('syncing'));
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(t('confirmRemove'))) return;
    setBusy('remove');
    const r = await removeDiscordLinkAction(communityId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setGuildId('');
    setMap({});
    toast.success(t('removed'));
    router.refresh();
  }

  const roleError = (id: string) => fields[`roleMap.${id}`];

  return (
    <SettingsSection id="discord" title={t('title')} description={t('description')}>
      <ol className="list-decimal space-y-1 ps-5 text-sm">
        <li>
          {t('step1')}{' '}
          {data.inviteUrl && (
            <a
              href={data.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary underline"
            >
              {t('addBot')}
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">{t('newTab')}</span>
            </a>
          )}
        </li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
        <li>{t('step4')}</li>
      </ol>
      {data.lastSyncResult && (
        <Alert tone="info" title={t('lastSync')}>
          <span suppressHydrationWarning>
            {data.lastSyncAt ? `${formatDateTime(data.lastSyncAt)}: ` : ''}
            {data.lastSyncResult}
          </span>
        </Alert>
      )}
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field label={t('guildId')} description={t('guildIdHint')} error={fields.guildId}>
          {(p) => (
            <Input
              {...p}
              value={guildId}
              inputMode="numeric"
              autoComplete="off"
              maxLength={25}
              onChange={(e) => setGuildId(e.target.value)}
            />
          )}
        </Field>
        {data.roles.length === 0 ? (
          <p className="text-sm text-muted">{t('noRoles')}</p>
        ) : (
          <fieldset>
            <legend className="text-sm font-semibold">{t('roles')}</legend>
            <p className="mt-1 text-sm text-muted">{t('rolesHint')}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {data.roles.map((role) => (
                <li key={role.id}>
                  <Field
                    label={t('roleLabel', { name: role.name })}
                    error={roleError(role.id)}
                    className="sm:max-w-md"
                  >
                    {(p) => (
                      <Input
                        {...p}
                        value={map[role.id] ?? ''}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={25}
                        placeholder={t('rolePlaceholder')}
                        onChange={(e) => setMap((m) => ({ ...m, [role.id]: e.target.value }))}
                      />
                    )}
                  </Field>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {data.guildId && (
            <>
              <Button type="button" variant="ghost" loading={busy === 'remove'} onClick={remove}>
                {t('remove')}
              </Button>
              <Button type="button" variant="secondary" loading={busy === 'sync'} onClick={sync}>
                <RefreshCw className="size-4" aria-hidden />
                {t('syncNow')}
              </Button>
            </>
          )}
          <Button type="submit" loading={saving}>
            {t('save')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
