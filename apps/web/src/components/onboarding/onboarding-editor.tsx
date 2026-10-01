'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Onboarding } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { saveOnboardingAction } from '@/app/actions/applications';

/** The welcome steps new members see: a message, rules to agree to, and roles to pick. */
export function OnboardingEditor({
  communityId,
  slug,
  initial,
  pickableRoles,
}: {
  communityId: string;
  slug: string;
  initial: Onboarding;
  /** How many roles members can give themselves (set on the roles page). */
  pickableRoles: number;
}) {
  const t = useTranslations('welcome.editor');
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  // Each rule gets a key of its own so moving them keeps focus and edits in place.
  const [keys, setKeys] = React.useState(() => initial.rules.map(() => crypto.randomUUID()));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('');

  const setRule = (i: number, text: string) =>
    setV((s) => ({ ...s, rules: s.rules.map((r, j) => (j === i ? text : r)) }));
  function move(i: number, by: number) {
    const reorder = <T,>(list: T[]) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + by, 0, x!);
      return next;
    };
    setV((s) => ({ ...s, rules: reorder(s.rules) }));
    setKeys(reorder);
    setStatus(t(by < 0 ? 'movedUp' : 'movedDown', { n: i + 1 }));
  }
  function remove(i: number) {
    setV((s) => ({ ...s, rules: s.rules.filter((_, j) => j !== i) }));
    setKeys((k) => k.filter((_, j) => j !== i));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await saveOnboardingAction(communityId, {
      ...v,
      rules: v.rules.map((x) => x.trim()).filter(Boolean),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(t('saved'));
      router.refresh();
    } else setError(r.error);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      <FormError message={error} />
      <SettingsSection id="welcome-on" title={t('title')} description={t('description')}>
        <SwitchField
          label={t('enabled')}
          description={t('enabledHint')}
          checked={v.enabled}
          onCheckedChange={(enabled) => setV((s) => ({ ...s, enabled }))}
        />
      </SettingsSection>

      <SettingsSection id="welcome-msg" title={t('messageTitle')}>
        <Field label={t('message')} description={t('messageHint')}>
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              maxLength={2000}
              value={v.welcome}
              onChange={(e) => setV((s) => ({ ...s, welcome: e.target.value }))}
            />
          )}
        </Field>
      </SettingsSection>

      <SettingsSection id="welcome-rules" title={t('rulesTitle')} description={t('rulesHint')}>
        <ol className="flex flex-col gap-3">
          {v.rules.map((rule, i) => (
            <li key={keys[i]} className="flex items-start gap-2">
              <Field label={t('ruleN', { n: i + 1 })} className="flex-1">
                {(p) => (
                  <Textarea
                    {...p}
                    rows={2}
                    maxLength={500}
                    value={rule}
                    onChange={(e) => setRule(i, e.target.value)}
                  />
                )}
              </Field>
              <div className="mt-7 flex flex-col gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === 0}
                  aria-label={t('moveUp', { n: i + 1 })}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === v.rules.length - 1}
                  aria-label={t('moveDown', { n: i + 1 })}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('remove', { n: i + 1 })}
                  className="text-danger"
                  onClick={() => remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <p role="status" className="sr-only">
          {status}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={v.rules.length >= 25}
          onClick={() => {
            setV((s) => ({ ...s, rules: [...s.rules, ''] }));
            setKeys((k) => [...k, crypto.randomUUID()]);
          }}
        >
          <Plus aria-hidden /> {t('addRule')}
        </Button>
        <div className="mt-4">
          <SwitchField
            label={t('requireAccept')}
            description={t('requireAcceptHint')}
            checked={v.requireAccept}
            onCheckedChange={(requireAccept) => setV((s) => ({ ...s, requireAccept }))}
          />
        </div>
      </SettingsSection>

      <SettingsSection id="welcome-roles" title={t('rolesTitle')}>
        <p className="text-sm">
          {t('rolesCount', { count: pickableRoles })}{' '}
          <Link href={`/c/${slug}/settings/roles`} className="font-semibold text-primary underline">
            {t('rolesLink')}
          </Link>
        </p>
      </SettingsSection>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
