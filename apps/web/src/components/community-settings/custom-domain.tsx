'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { PlanLock } from '@/components/billing/plan-lock';
import {
  removeCustomDomainAction,
  setCustomDomainAction,
  verifyCustomDomainAction,
} from '@/app/actions/integrations';
import { formatDateTime } from '@/lib/format';

export interface CustomDomainData {
  domain: string | null;
  verified: boolean;
  record: { name: string; value: string } | null;
  target: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  allowed: boolean;
}

/** One DNS record to add, laid out like a DNS provider's form. */
function DnsRecord({ type, name, value }: { type: string; name: string; value: string }) {
  const t = useTranslations('customDomain');
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-ui border border-border bg-surface-2 p-3 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
      <dt className="font-semibold">{t('type')}</dt>
      <dd className="font-mono">{type}</dd>
      <dt className="font-semibold">{t('host')}</dt>
      <dd className="font-mono break-all">{name}</dd>
      <dt className="font-semibold">{t('value')}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </dl>
  );
}

/** Set up the community's own domain: enter it, add two DNS records, check them. */
export function CustomDomain({
  communityId,
  slug,
  data,
}: {
  communityId: string;
  slug: string;
  data: CustomDomainData;
}) {
  const t = useTranslations('customDomain');
  const router = useRouter();
  const [domain, setDomain] = React.useState(data.domain ?? '');
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<'check' | 'remove' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await setCustomDomainAction(communityId, domain);
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

  async function check() {
    setBusy('check');
    const r = await verifyCustomDomainAction(communityId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    if (r.data.verified) toast.success(t('verifiedToast'));
    else toast.error(t('notYet'));
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(t('confirmRemove', { domain: data.domain ?? '' }))) return;
    setBusy('remove');
    const r = await removeCustomDomainAction(communityId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setDomain('');
    toast.success(t('removed'));
    router.refresh();
  }

  return (
    <SettingsSection id="domain" title={t('title')} description={t('description')}>
      {!data.allowed && <PlanLock perk="customDomain" slug={slug} what={t('locked')} />}
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field label={t('domain')} description={t('domainHint')} error={fields.domain ?? fields._}>
          {(p) => (
            <Input
              {...p}
              value={domain}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="forum.example.com"
              maxLength={253}
              disabled={!data.allowed}
              onChange={(e) => setDomain(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          {data.domain && (
            <Button type="button" variant="ghost" loading={busy === 'remove'} onClick={remove}>
              {t('remove')}
            </Button>
          )}
          <Button type="submit" loading={saving} disabled={!data.allowed}>
            {t('save')}
          </Button>
        </div>
      </form>

      {data.domain && data.record && (
        <div className="flex flex-col gap-3">
          {data.verified ? (
            <Alert tone="success" title={t('live', { domain: data.domain })}>
              <a
                href={`https://${data.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline"
              >
                {t('visit')}
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">{t('newTab')}</span>
              </a>
              <p className="mt-1 text-muted">{t('liveHint')}</p>
            </Alert>
          ) : (
            <p className="text-sm">{t('steps')}</p>
          )}
          <h3 className="text-sm font-semibold">{t('recordsTitle')}</h3>
          <DnsRecord type="CNAME" name={data.domain} value={data.target} />
          <DnsRecord type="TXT" name={data.record.name} value={data.record.value} />
          {data.lastError && !data.verified && (
            <Alert tone="warning" title={t('checkFailed')}>
              {data.lastError}
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted" suppressHydrationWarning>
              {data.lastCheckedAt
                ? t('lastChecked', { when: formatDateTime(data.lastCheckedAt) })
                : t('neverChecked')}
            </p>
            <Button
              type="button"
              variant="secondary"
              loading={busy === 'check'}
              disabled={!data.allowed}
              onClick={check}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {data.verified ? t('checkAgain') : t('check')}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
