'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { StaffMember, StaffRole } from '@gamecentral/core';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { setStaffRoleAction } from '@/app/actions/admin';

/** Who can change whom: the owner manages admins and moderators; admins manage moderators. */
function canManage(viewer: StaffRole, target: StaffRole): boolean {
  if (target === 'owner') return false;
  return viewer === 'owner' || (viewer === 'admin' && target === 'moderator');
}

export function StaffManager({
  staff,
  viewer,
}: {
  staff: StaffMember[];
  viewer: { id: string; role: StaffRole };
}) {
  const t = useTranslations('admin.staff');
  const tr = useTranslations('admin.roles');
  const router = useRouter();
  const grantable: StaffRole[] = viewer.role === 'owner' ? ['moderator', 'admin'] : ['moderator'];
  const [who, setWho] = React.useState('');
  const [role, setRole] = React.useState<string>('moderator');
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function change(target: string, next: string, done: string) {
    setPending(target);
    const r = await setStaffRoleAction({ who: target, role: next });
    setPending(null);
    if (r.ok) {
      toast.success(done);
      router.refresh();
    } else toast.error(r.error);
    return r.ok;
  }

  return (
    <>
      <SettingsSection id="add" title={t('addTitle')} description={t('addDescription')}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setPending('add');
            const r = await setStaffRoleAction({ who, role });
            setPending(null);
            if (r.ok) {
              toast.success(t('added'));
              setWho('');
              router.refresh();
            } else setError(r.error);
          }}
        >
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label={t('who')} description={t('whoHint')}>
              {(p) => (
                <Input
                  {...p}
                  value={who}
                  autoComplete="off"
                  autoCapitalize="none"
                  onChange={(e) => setWho(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('role')}>
              {(p) => (
                <Select {...p} value={role} onValueChange={setRole}>
                  {grantable.map((r) => (
                    <option key={r} value={r}>
                      {tr(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" loading={pending === 'add'}>
              {t('add')}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection id="team" title={t('teamTitle')}>
        <ul className="flex flex-col divide-y divide-border">
          {staff.map((s) => {
            const manageable = s.id !== viewer.id && canManage(viewer.role, s.role);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.name}
                    {s.id === viewer.id && <span className="text-muted"> {t('you')}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.username ? `@${s.username} · ` : ''}
                    {s.email}
                  </p>
                </div>
                <Badge tone={s.role === 'moderator' ? 'neutral' : 'primary'}>{tr(s.role)}</Badge>
                {manageable && (
                  <>
                    {viewer.role === 'owner' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={pending === s.id}
                        onClick={() =>
                          void change(
                            s.id,
                            s.role === 'admin' ? 'moderator' : 'admin',
                            t('changed', { name: s.name }),
                          )
                        }
                      >
                        {s.role === 'admin' ? t('makeModerator') : t('makeAdmin')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('removeLabel', { name: s.name })}
                      onClick={() => void change(s.id, 'none', t('removed', { name: s.name }))}
                    >
                      {t('remove')}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </>
  );
}
