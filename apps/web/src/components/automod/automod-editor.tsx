'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { AutomodAction, AutomodConfig } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { resumeJoinsAction, saveAutomodAction } from '@/app/actions/automod';
import { formatDateTime } from '@/lib/format';

/** One entry per line (commas work too). */
const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);

interface RoleOption {
  id: string;
  name: string;
}

/** A community's automod rules. */
export function AutomodEditor({
  communityId,
  initial,
  roles,
  joinsPausedUntil,
}: {
  communityId: string;
  initial: AutomodConfig;
  roles: RoleOption[];
  joinsPausedUntil: string | null;
}) {
  const t = useTranslations('automod');
  const locale = useLocale();
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [words, setWords] = React.useState(initial.words.list.join('\n'));
  const [allow, setAllow] = React.useState(initial.links.allow.join('\n'));
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [resuming, setResuming] = React.useState(false);

  function set<K extends keyof AutomodConfig>(key: K, patch: Partial<AutomodConfig[K]>) {
    setV((s) => ({ ...s, [key]: { ...(s[key] as object), ...patch } }));
  }
  const num = (text: string) => (text === '' ? 0 : Number(text));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await saveAutomodAction(communityId, {
      ...v,
      words: { ...v.words, list: toList(words) },
      links: { ...v.links, allow: toList(allow) },
    });
    setSaving(false);
    if (r.ok) {
      setFields({});
      toast.success(t('saved'));
      router.refresh();
    } else {
      setError(r.error);
      setFields(r.fields ?? {});
    }
  }

  const actionField = (
    label: string,
    value: AutomodAction,
    onChange: (a: AutomodAction) => void,
    disabled: boolean,
  ) => (
    <Field label={label}>
      {(p) => (
        <Select
          {...p}
          value={value}
          disabled={disabled}
          onValueChange={(a) => onChange(a as AutomodAction)}
        >
          <option value="block">{t('actions.block')}</option>
          <option value="hold">{t('actions.hold')}</option>
        </Select>
      )}
    </Field>
  );

  const paused = joinsPausedUntil && new Date(joinsPausedUntil) > new Date();

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      <FormError message={error} />
      <Alert tone="info">{t('exemptNote')}</Alert>

      <SettingsSection id="am-words" title={t('words.title')} description={t('words.description')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('words.enabled')}
            checked={v.words.enabled}
            onCheckedChange={(enabled) => set('words', { enabled })}
          />
          <Field
            label={t('words.list')}
            description={t('words.listHint')}
            error={
              fields['words.list'] ??
              Object.entries(fields).find(([k]) => k.startsWith('words.list.'))?.[1]
            }
          >
            {(p) => (
              <Textarea
                {...p}
                rows={5}
                value={words}
                disabled={!v.words.enabled}
                onChange={(e) => setWords(e.target.value)}
              />
            )}
          </Field>
          {actionField(
            t('words.action'),
            v.words.action,
            (action) => set('words', { action }),
            !v.words.enabled,
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="am-links" title={t('links.title')} description={t('links.description')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('links.enabled')}
            checked={v.links.enabled}
            onCheckedChange={(enabled) => set('links', { enabled })}
          />
          <Field
            label={t('links.allow')}
            description={t('links.allowHint')}
            error={Object.entries(fields).find(([k]) => k.startsWith('links.allow'))?.[1]}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                value={allow}
                disabled={!v.links.enabled}
                onChange={(e) => setAllow(e.target.value)}
              />
            )}
          </Field>
          {actionField(
            t('links.action'),
            v.links.action,
            (action) => set('links', { action }),
            !v.links.enabled,
          )}
          <SwitchField
            label={t('invites.enabled')}
            description={t('invites.description')}
            checked={v.invites.enabled}
            onCheckedChange={(enabled) => set('invites', { enabled })}
          />
          {actionField(
            t('invites.action'),
            v.invites.action,
            (action) => set('invites', { action }),
            !v.invites.enabled,
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="am-spam" title={t('spam.title')} description={t('spam.description')}>
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('spam.enabled')}
            checked={v.spam.enabled}
            onCheckedChange={(enabled) => set('spam', { enabled })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('spam.maxMentions')} error={fields['spam.maxMentions']}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={v.spam.maxMentions}
                  disabled={!v.spam.enabled}
                  onChange={(e) => set('spam', { maxMentions: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('spam.maxPerTenSeconds')} error={fields['spam.maxPerTenSeconds']}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={30}
                  value={v.spam.maxPerTenSeconds}
                  disabled={!v.spam.enabled}
                  onChange={(e) => set('spam', { maxPerTenSeconds: num(e.target.value) })}
                />
              )}
            </Field>
            <Field
              label={t('spam.timeoutMinutes')}
              description={t('spam.timeoutHint')}
              error={fields['spam.timeoutMinutes']}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1440}
                  value={v.spam.timeoutMinutes}
                  disabled={!v.spam.enabled}
                  onChange={(e) => set('spam', { timeoutMinutes: num(e.target.value) })}
                />
              )}
            </Field>
          </div>
          <SwitchField
            label={t('spam.duplicates')}
            description={t('spam.duplicatesHint')}
            checked={v.spam.duplicates}
            disabled={!v.spam.enabled}
            onCheckedChange={(duplicates) => set('spam', { duplicates })}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        id="am-new"
        title={t('newMembers.title')}
        description={t('newMembers.description')}
      >
        <div className="flex flex-col gap-4">
          <SwitchField
            label={t('newMembers.enabled')}
            checked={v.newMembers.enabled}
            onCheckedChange={(enabled) => set('newMembers', { enabled })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('newMembers.accountAge')}
              error={fields['newMembers.minAccountAgeHours']}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={720}
                  value={v.newMembers.minAccountAgeHours}
                  disabled={!v.newMembers.enabled}
                  onChange={(e) => set('newMembers', { minAccountAgeHours: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('newMembers.memberFor')} error={fields['newMembers.minMemberMinutes']}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10080}
                  value={v.newMembers.minMemberMinutes}
                  disabled={!v.newMembers.enabled}
                  onChange={(e) => set('newMembers', { minMemberMinutes: num(e.target.value) })}
                />
              )}
            </Field>
          </div>
          {actionField(
            t('newMembers.action'),
            v.newMembers.action,
            (action) => set('newMembers', { action }),
            !v.newMembers.enabled,
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="am-joins" title={t('joins.title')} description={t('joins.description')}>
        <div className="flex flex-col gap-4">
          {paused && (
            <Alert
              tone="warning"
              title={t('joins.paused', { until: formatDateTime(joinsPausedUntil, 'auto', locale) })}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                loading={resuming}
                onClick={async () => {
                  setResuming(true);
                  const r = await resumeJoinsAction(communityId);
                  setResuming(false);
                  if (r.ok) {
                    toast.success(t('joins.resumed'));
                    router.refresh();
                  } else toast.error(r.error);
                }}
              >
                {t('joins.resume')}
              </Button>
            </Alert>
          )}
          <SwitchField
            label={t('joins.enabled')}
            checked={v.joins.enabled}
            onCheckedChange={(enabled) => set('joins', { enabled })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('joins.maxPerMinute')} error={fields['joins.maxPerMinute']}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={500}
                  value={v.joins.maxPerMinute}
                  disabled={!v.joins.enabled}
                  onChange={(e) => set('joins', { maxPerMinute: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('joins.pauseMinutes')} error={fields['joins.pauseMinutes']}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={240}
                  value={v.joins.pauseMinutes}
                  disabled={!v.joins.enabled}
                  onChange={(e) => set('joins', { pauseMinutes: num(e.target.value) })}
                />
              )}
            </Field>
          </div>
        </div>
      </SettingsSection>

      {roles.length > 0 && (
        <SettingsSection
          id="am-exempt"
          title={t('exempt.title')}
          description={t('exempt.description')}
        >
          <fieldset>
            <legend className="sr-only">{t('exempt.title')}</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {roles.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--c-primary)]"
                      checked={v.exemptRoleIds.includes(r.id)}
                      onChange={(e) =>
                        setV((s) => ({
                          ...s,
                          exemptRoleIds: e.target.checked
                            ? [...s.exemptRoleIds, r.id]
                            : s.exemptRoleIds.filter((id) => id !== r.id),
                        }))
                      }
                    />
                    {r.name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </SettingsSection>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
