'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CHANNEL_SCOPED, Permission, type PermissionName } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { listOverwritesAction, setOverwriteAction } from '@/app/actions/channels';
import { cn } from '@/lib/utils';

type State = 'deny' | 'inherit' | 'allow';

const NAMES = (Object.keys(Permission) as PermissionName[]).filter(
  (n) => (Permission[n] & CHANNEL_SCOPED) !== 0n,
);

/**
 * Per-channel overrides for one role at a time. Each permission can be denied, left to the
 * role's normal permissions, or allowed.
 */
export function ChannelPermissions({
  communityId,
  channelId,
  roles,
  onDone,
}: {
  communityId: string;
  channelId: string;
  roles: { id: string; name: string; isDefault: boolean }[];
  onDone: () => void;
}) {
  const t = useTranslations('channels');
  const tr = useTranslations('roles');
  const [overwrites, setOverwrites] = React.useState<
    { targetType: string; targetId: string; allow: string; deny: string }[] | null
  >(null);
  const [roleId, setRoleId] = React.useState(
    roles.find((r) => r.isDefault)?.id ?? roles[0]?.id ?? '',
  );
  const [states, setStates] = React.useState<Record<string, State>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void listOverwritesAction(communityId, channelId).then((r) => {
      if (!live) return;
      if (r.ok) setOverwrites(r.data);
      else toast.error(r.error);
    });
    return () => {
      live = false;
    };
  }, [communityId, channelId]);

  const current = React.useMemo(() => {
    const o = overwrites?.find((x) => x.targetType === 'role' && x.targetId === roleId);
    const allow = BigInt(o?.allow ?? '0');
    const deny = BigInt(o?.deny ?? '0');
    return Object.fromEntries(
      NAMES.map((n) => [
        n,
        (allow & Permission[n]) !== 0n
          ? 'allow'
          : (deny & Permission[n]) !== 0n
            ? 'deny'
            : 'inherit',
      ]),
    ) as Record<string, State>;
  }, [overwrites, roleId]);
  const [lastCurrent, setLastCurrent] = React.useState(current);
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setStates(current);
  }

  async function save() {
    let allow = 0n;
    let deny = 0n;
    for (const n of NAMES) {
      if (states[n] === 'allow') allow |= Permission[n];
      if (states[n] === 'deny') deny |= Permission[n];
    }
    setPending(true);
    const r = await setOverwriteAction(communityId, channelId, {
      targetType: 'role',
      targetId: roleId,
      allow: allow.toString(),
      deny: deny.toString(),
    });
    setPending(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(t('permsSaved'));
    setOverwrites((list) => [
      ...(list ?? []).filter((x) => !(x.targetType === 'role' && x.targetId === roleId)),
      { targetType: 'role', targetId: roleId, allow: allow.toString(), deny: deny.toString() },
    ]);
  }

  if (overwrites === null) {
    return (
      <div className="grid place-items-center p-6">
        <Spinner label={t('loadingPerms')} />
      </div>
    );
  }

  const customised = new Set(
    overwrites.filter((o) => o.allow !== '0' || o.deny !== '0').map((o) => o.targetId),
  );
  return (
    <div className="flex flex-col gap-4">
      <Field label={t('permsRole')} description={t('permsRoleHint')}>
        {(p) => (
          <Select {...p} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.isDefault ? '@everyone' : r.name}
                {customised.has(r.id) ? ` · ${t('customised')}` : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <ul className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto rounded-ui border border-border">
        {NAMES.map((n) => (
          <li key={n}>
            <fieldset className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <legend className="sr-only">{tr(`perms.${n}.name`)}</legend>
              <span aria-hidden className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{tr(`perms.${n}.name`)}</span>
                <span className="block text-xs text-muted">{tr(`perms.${n}.description`)}</span>
              </span>
              <span className="flex overflow-hidden rounded-ui-sm border border-border">
                {(['deny', 'inherit', 'allow'] as State[]).map((s) => (
                  <label
                    key={s}
                    className={cn(
                      'cursor-pointer px-2.5 py-1 text-xs font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--mx-focus)]',
                      states[n] === s
                        ? s === 'allow'
                          ? 'bg-success text-white'
                          : s === 'deny'
                            ? 'bg-danger text-white'
                            : 'bg-surface-2 text-fg'
                        : 'text-muted',
                    )}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`perm-${n}`}
                      value={s}
                      checked={states[n] === s}
                      onChange={() => setStates((x) => ({ ...x, [n]: s }))}
                    />
                    {t(`permStates.${s}`)}
                  </label>
                ))}
              </span>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('close')}
        </Button>
        <Button type="button" onClick={() => void save()} loading={pending}>
          {t('savePerms')}
        </Button>
      </div>
    </div>
  );
}
