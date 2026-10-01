'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoleIcon } from '@/components/community/role-decor';
import { completeOnboardingAction } from '@/app/actions/applications';
import { setMemberRoleAction } from '@/app/actions/roles';
import { cn } from '@/lib/utils';

interface PickableRole {
  id: string;
  name: string;
  color: string | null;
  iconUrl: string | null;
}

/** A new member's welcome: the community's message, its rules to agree to, and roles to pick. */
export function WelcomeSteps({
  communityId,
  slug,
  meId,
  welcome,
  rules,
  roles,
  initialRoleIds,
  onboarded,
}: {
  communityId: string;
  slug: string;
  meId: string;
  welcome: string;
  rules: string[];
  roles: PickableRole[];
  initialRoleIds: string[];
  onboarded: boolean;
}) {
  const t = useTranslations('welcome');
  const router = useRouter();
  const [agreed, setAgreed] = React.useState(onboarded);
  const [mine, setMine] = React.useState(new Set(initialRoleIds));
  const [busyRole, setBusyRole] = React.useState<string | null>(null);
  const [finishing, setFinishing] = React.useState(false);
  const [error, setError] = React.useState('');

  async function toggleRole(role: PickableRole) {
    const on = !mine.has(role.id);
    setBusyRole(role.id);
    const r = await setMemberRoleAction(communityId, meId, role.id, on);
    setBusyRole(null);
    if (!r.ok) return toast.error(r.error);
    setMine((s) => {
      const next = new Set(s);
      if (on) next.add(role.id);
      else next.delete(role.id);
      return next;
    });
  }

  async function finish() {
    if (rules.length && !agreed) {
      setError(t('agreeFirst'));
      return;
    }
    setFinishing(true);
    const r = await completeOnboardingAction(communityId);
    setFinishing(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('done'));
    router.push(`/c/${slug}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {welcome && (
        <section
          aria-labelledby="welcome-msg-h"
          className="rounded-ui-lg border border-border bg-surface p-5"
        >
          <h3 id="welcome-msg-h" className="sr-only">
            {t('messageHeading')}
          </h3>
          <p className="whitespace-pre-wrap">{welcome}</p>
        </section>
      )}

      {rules.length > 0 && (
        <section
          aria-labelledby="rules-h"
          className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-5"
        >
          <h3 id="rules-h" className="text-lg font-bold">
            {t('rulesHeading')}
          </h3>
          <ol className="flex flex-col gap-2">
            {rules.map((rule, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 whitespace-pre-wrap">{rule}</span>
              </li>
            ))}
          </ol>
          <label className="mt-2 flex items-start gap-2 font-semibold">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--c-primary)]"
              checked={agreed}
              aria-describedby={error ? 'agree-error' : undefined}
              onChange={(e) => {
                setAgreed(e.target.checked);
                setError('');
              }}
            />
            {t('agree')}
          </label>
          {error && (
            <p id="agree-error" role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </section>
      )}

      {roles.length > 0 && (
        <section
          aria-labelledby="roles-h"
          className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-5"
        >
          <div>
            <h3 id="roles-h" className="text-lg font-bold">
              {t('rolesHeading')}
            </h3>
            <p className="text-sm text-muted">{t('rolesHint')}</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const on = mine.has(role.id);
              return (
                <li key={role.id}>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={on}
                    loading={busyRole === role.id}
                    onClick={() => void toggleRole(role)}
                    className={cn('rounded-full', on && 'border-primary bg-primary/12')}
                  >
                    {on ? (
                      <Check aria-hidden />
                    ) : role.iconUrl ? (
                      <RoleIcon url={role.iconUrl} />
                    ) : (
                      <span
                        aria-hidden
                        className="size-3 rounded-full"
                        style={{ background: role.color ?? 'var(--c-text-muted)' }}
                      />
                    )}
                    {role.name}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex justify-end">
        <Button size="lg" loading={finishing} onClick={() => void finish()}>
          {onboarded ? t('saveAndGo') : t('finish')}
        </Button>
      </div>
    </div>
  );
}
