'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Trash2, Webhook } from 'lucide-react';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@gamecentral/shared/integrations-values';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { SecretBox } from '@/components/developer/secret-box';
import {
  createWebhookAction,
  deleteWebhookAction,
  setWebhookActiveAction,
  testWebhookAction,
} from '@/app/actions/integrations';
import { formatDateTime } from '@/lib/format';

export interface WebhookItem {
  id: string;
  name: string;
  kind: 'json' | 'discord';
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
  failures: number;
}

const DEFAULT_EVENTS: WebhookEvent[] = [
  'announcement.created',
  'event.created',
  'server.down',
  'server.up',
];

/** Add webhooks (Discord channels or your own code), see how they're doing, test and remove them. */
export function WebhookManager({
  communityId,
  webhooks,
}: {
  communityId: string;
  webhooks: WebhookItem[];
}) {
  const t = useTranslations('webhooks');
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState<WebhookEvent[]>(DEFAULT_EVENTS);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await createWebhookAction(communityId, { name, url, events });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    toast.success(t('added', { name: r.data.view.name }));
    setSecret(r.data.secret);
    setName('');
    setUrl('');
    setEvents(DEFAULT_EVENTS);
    setFields({});
    router.refresh();
  }

  async function test(item: WebhookItem) {
    setBusy(`test:${item.id}`);
    const r = await testWebhookAction(communityId, item.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    if (r.data.ok) toast.success(t('testOk'));
    else toast.error(t('testFailed', { error: r.data.error ?? '' }));
    router.refresh();
  }

  async function toggle(item: WebhookItem, active: boolean) {
    setBusy(`active:${item.id}`);
    const r = await setWebhookActiveAction(communityId, item.id, active);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  }

  async function remove(item: WebhookItem) {
    if (!window.confirm(t('confirmDelete', { name: item.name }))) return;
    setBusy(`delete:${item.id}`);
    const r = await deleteWebhookAction(communityId, item.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('deleted', { name: item.name }));
    router.refresh();
  }

  const eventsError =
    fields.events ?? Object.entries(fields).find(([k]) => k.startsWith('events.'))?.[1];

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection id="webhook-new" title={t('newTitle')} description={t('newHint')}>
        {secret && (
          <SecretBox
            title={t('secretTitle')}
            message={t('secretHint')}
            value={secret}
            onDone={() => setSecret(null)}
          />
        )}
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label={t('name')} error={fields.name}>
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
            <Field label={t('url')} description={t('urlHint')} error={fields.url}>
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  inputMode="url"
                  value={url}
                  maxLength={500}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
            </Field>
          </div>
          <fieldset aria-describedby={eventsError ? 'webhook-events-error' : undefined}>
            <legend className="text-sm font-semibold">{t('events')}</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <li key={ev}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--c-primary)]"
                      checked={events.includes(ev)}
                      onChange={(e) =>
                        setEvents((s) =>
                          e.target.checked ? [...s, ev] : s.filter((x) => x !== ev),
                        )
                      }
                    />
                    <span>{t(`event.${ev.replace('.', '_')}`)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {eventsError && (
              <p id="webhook-events-error" className="mt-2 text-sm font-medium text-danger">
                {eventsError}
              </p>
            )}
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              {t('add')}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection id="webhook-list" title={t('listTitle')}>
        {webhooks.length === 0 ? (
          <p className="text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {webhooks.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Webhook className="size-5 text-muted" aria-hidden />
                  <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-semibold">
                    {item.name}
                    <Badge tone={item.kind === 'discord' ? 'primary' : 'neutral'}>
                      {item.kind === 'discord' ? t('kindDiscord') : t('kindJson')}
                    </Badge>
                    {!item.active && <Badge tone="warning">{t('off')}</Badge>}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={item.active}
                      disabled={busy === `active:${item.id}`}
                      onCheckedChange={(v) => toggle(item, v)}
                      aria-label={t('activeLabel', { name: item.name })}
                    />
                    {t('active')}
                  </label>
                </div>
                <p className="font-mono text-xs break-all text-muted">{item.url}</p>
                <p className="text-sm text-muted">
                  {item.events.map((ev) => t(`event.${ev.replace('.', '_')}`)).join(' · ')}
                </p>
                <p
                  className={item.lastError ? 'text-sm text-danger' : 'text-sm text-muted'}
                  suppressHydrationWarning
                >
                  {item.lastError
                    ? t('lastError', { error: item.lastError, failures: item.failures })
                    : item.lastDeliveredAt
                      ? t('lastDelivered', {
                          when: formatDateTime(item.lastDeliveredAt, 'auto', locale),
                        })
                      : t('notYet')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={busy === `test:${item.id}`}
                    disabled={!item.active}
                    onClick={() => test(item)}
                    aria-label={t('testLabel', { name: item.name })}
                  >
                    <Send className="size-4" aria-hidden />
                    {t('test')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={busy === `delete:${item.id}`}
                    onClick={() => remove(item)}
                    aria-label={t('deleteLabel', { name: item.name })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
