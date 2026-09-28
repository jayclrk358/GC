'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_NAME_STYLE,
  has,
  NAME_ANIMATIONS,
  NAME_EFFECTS,
  nameStyleView,
  Permission,
  readableOn,
  PERMISSION_META,
  type NameBackdrops,
  type NameStyle,
  type PermissionGroup,
  type PermissionName,
} from '@magnox/shared';
import type { RoleSummary } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ImageUpload } from '@/components/upload/image-upload';
import { RoleIcon, StyledName } from '@/components/community/role-decor';
import { Alert } from '@/components/ui/misc';
import { Switch, SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import {
  createRoleAction,
  deleteRoleAction,
  reorderRolesAction,
  updateRoleAction,
} from '@/app/actions/roles';
import { cn } from '@/lib/utils';

const GROUPS: PermissionGroup[] = ['general', 'moderation', 'administration'];

export function RoleEditor({
  communityId,
  roles: initialRoles,
  actor,
  backdrops,
}: {
  communityId: string;
  roles: RoleSummary[];
  /** The community theme's backgrounds, for readable name colours and the preview. */
  backdrops: NameBackdrops;
  actor: { isOwner: boolean; topPosition: number; perms: string };
}) {
  const t = useTranslations('roles');
  const router = useRouter();
  const [roles, setRoles] = React.useState(initialRoles);
  const [lastInitial, setLastInitial] = React.useState(initialRoles);
  if (initialRoles !== lastInitial) {
    setLastInitial(initialRoles);
    setRoles(initialRoles);
  }
  const [selectedId, setSelectedId] = React.useState(
    initialRoles.find((r) => !r.isDefault)?.id ?? initialRoles[0]?.id,
  );
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const [draft, setDraft] = React.useState(selected);
  const [lastSelected, setLastSelected] = React.useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setDraft(selected);
  }
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const actorPerms = BigInt(actor.perms);

  const canManage = (r: RoleSummary) =>
    actor.isOwner || r.isDefault || r.position < actor.topPosition;
  const orderable = roles.filter(
    (r) => !r.isDefault && (actor.isOwner || r.position < actor.topPosition),
  );

  async function createRole() {
    const r = await createRoleAction(communityId, {
      name: t('newRoleName'),
      permissions: '0',
      color: '#64748b',
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSelectedId(r.data.id);
    setStatus(t('created'));
    router.refresh();
  }

  async function save() {
    if (!draft) return;
    setPending(true);
    setError(null);
    const r = await updateRoleAction(communityId, draft.id, {
      name: draft.name,
      color: draft.color,
      icon: draft.icon,
      iconKey: draft.iconKey,
      nameStyle: draft.nameStyle,
      permissions: draft.permissions,
      hoist: draft.hoist,
      mentionable: draft.mentionable,
      selfAssignable: draft.selfAssignable,
    });
    setPending(false);
    if (r.ok) {
      toast.success(t('saved'));
      router.refresh();
    } else setError(r.error);
  }

  async function remove() {
    if (!draft || draft.isDefault) return;
    const r = await deleteRoleAction(communityId, draft.id);
    if (r.ok) {
      setSelectedId(roles.find((x) => x.id !== draft.id && !x.isDefault)?.id);
      setStatus(t('deleted', { name: draft.name }));
      router.refresh();
    } else toast.error(r.error);
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = orderable.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    const r = await reorderRolesAction(communityId, ids);
    if (r.ok) {
      setStatus(t('moved', { name: roles.find((x) => x.id === id)?.name ?? '', position: j + 1 }));
      router.refresh();
    } else toast.error(r.error);
  }

  function togglePerm(name: PermissionName, on: boolean) {
    if (!draft) return;
    const flag = Permission[name];
    const current = BigInt(draft.permissions);
    setDraft({ ...draft, permissions: (on ? current | flag : current & ~flag).toString() });
  }

  const editable = draft ? canManage(draft) : false;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="flex flex-col gap-3">
        <Button onClick={createRole} variant="secondary">
          <Plus aria-hidden /> {t('create')}
        </Button>
        <p className="text-xs text-muted">{t('hierarchyHint')}</p>
        <ul className="flex flex-col gap-1" aria-label={t('listLabel')}>
          {roles.map((r) => {
            const idx = orderable.findIndex((o) => o.id === r.id);
            return (
              <li key={r.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-current={r.id === selected?.id ? 'true' : undefined}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-ui-sm px-3 py-2 text-start text-sm font-semibold hover:bg-surface-2',
                    r.id === selected?.id && 'bg-surface-2 ring-2 ring-primary',
                  )}
                >
                  {r.iconUrl ? (
                    <RoleIcon url={r.iconUrl} />
                  ) : (
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: r.color ?? 'var(--c-text-muted)' }}
                    />
                  )}
                  <span className="truncate">{r.name}</span>
                  {!canManage(r) && (
                    <Lock
                      className="ms-auto size-3.5 text-muted"
                      aria-label={t('locked')}
                      role="img"
                    />
                  )}
                </button>
                {idx >= 0 && (
                  <span className="flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={idx === 0}
                      onClick={() => void move(r.id, -1)}
                      aria-label={t('moveUp', { name: r.name })}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={idx === orderable.length - 1}
                      onClick={() => void move(r.id, 1)}
                      aria-label={t('moveDown', { name: r.name })}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {draft && (
        <form
          className="flex flex-col gap-5 rounded-ui-lg border border-border bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          aria-labelledby="role-edit-h"
        >
          <h2 id="role-edit-h" className="text-lg font-bold">
            {t('editing', { name: draft.name })}
          </h2>
          {!editable && <Alert tone="warning">{t('cannotEdit')}</Alert>}
          <FormError message={error} />
          <fieldset disabled={!editable} className="flex flex-col gap-5">
            {!draft.isDefault && (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label={t('name')}>
                  {(p) => (
                    <Input
                      {...p}
                      value={draft.name}
                      maxLength={40}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t('color')}>
                  {(p) => (
                    <input
                      {...p}
                      type="color"
                      value={draft.color ?? '#64748b'}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                      className="h-10 w-16 cursor-pointer rounded-ui border border-border bg-surface"
                    />
                  )}
                </Field>
              </div>
            )}
            {draft.isDefault && <p className="text-sm text-muted">{t('everyoneHint')}</p>}
            {!draft.isDefault && (
              <NametagFields
                communityId={communityId}
                name={draft.name || t('previewName')}
                color={draft.color}
                style={draft.nameStyle ?? DEFAULT_NAME_STYLE}
                iconKey={draft.iconKey}
                backdrops={backdrops}
                onStyle={(nameStyle) => setDraft({ ...draft, nameStyle })}
                onIcon={(iconKey) => setDraft({ ...draft, iconKey })}
              />
            )}
            {!draft.isDefault && (
              <div className="flex flex-col">
                <SwitchField
                  label={t('hoist')}
                  description={t('hoistDesc')}
                  checked={draft.hoist}
                  onCheckedChange={(v) => setDraft({ ...draft, hoist: v })}
                  disabled={!editable}
                />
                <SwitchField
                  label={t('mentionable')}
                  description={t('mentionableDesc')}
                  checked={draft.mentionable}
                  onCheckedChange={(v) => setDraft({ ...draft, mentionable: v })}
                  disabled={!editable}
                />
                <SwitchField
                  label={t('selfAssignable')}
                  description={t('selfAssignableDesc')}
                  checked={draft.selfAssignable}
                  onCheckedChange={(v) => setDraft({ ...draft, selfAssignable: v })}
                  disabled={!editable}
                />
              </div>
            )}
            {has(BigInt(draft.permissions), Permission.ADMINISTRATOR) && (
              <Alert tone="info">{t('adminNotice')}</Alert>
            )}
            {GROUPS.map((group) => (
              <fieldset key={group} className="flex flex-col gap-1">
                <legend className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">
                  {t(`groups.${group}`)}
                </legend>
                {(Object.keys(PERMISSION_META) as PermissionName[])
                  .filter((n) => PERMISSION_META[n].group === group)
                  .map((name) => {
                    const checked = has(BigInt(draft.permissions), Permission[name]);
                    const grantable = actor.isOwner || has(actorPerms, Permission[name]);
                    const id = `perm-${name}`;
                    return (
                      <div
                        key={name}
                        className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0"
                      >
                        <div>
                          <label htmlFor={id} className="font-semibold">
                            {t(`perms.${name}.name`)}
                          </label>
                          <p id={`${id}-d`} className="text-sm text-muted">
                            {t(`perms.${name}.description`)}
                          </p>
                        </div>
                        <Switch
                          id={id}
                          checked={checked}
                          disabled={!editable || (!checked && !grantable)}
                          onCheckedChange={(v) => togglePerm(name, v)}
                          aria-describedby={`${id}-d`}
                        />
                      </div>
                    );
                  })}
              </fieldset>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
            <Button type="submit" loading={pending} disabled={!editable}>
              {t('save')}
            </Button>
            {!draft.isDefault && editable && (
              <Button type="button" variant="ghost" onClick={() => void remove()}>
                <Trash2 aria-hidden /> {t('delete')}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/** A role's icon image and nametag effect, with a live preview on light and dark. */
function NametagFields({
  communityId,
  name,
  color,
  style,
  iconKey,
  backdrops,
  onStyle,
  onIcon,
}: {
  communityId: string;
  name: string;
  color: string | null;
  style: NameStyle;
  iconKey: string | null;
  backdrops: NameBackdrops;
  onStyle: (s: NameStyle) => void;
  onIcon: (key: string | null) => void;
}) {
  const t = useTranslations('roles');
  const view = nameStyleView(color, style, backdrops);
  const flowing = style.effect === 'gradient' || style.effect === 'rainbow';
  return (
    <fieldset className="flex flex-col gap-4 rounded-ui border border-border p-4">
      <legend className="px-1 text-sm font-bold tracking-wide text-muted uppercase">
        {t('nametag')}
      </legend>
      <ImageUpload
        label={t('iconImage')}
        description={t('iconImageDesc')}
        purpose="role-icon"
        communityId={communityId}
        value={iconKey}
        onChange={onIcon}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('nameEffect')} description={t('nameEffectDesc')}>
          {(p) => (
            <Select
              {...p}
              value={style.effect}
              onValueChange={(value) => {
                const effect = value as NameStyle['effect'];
                const keepsFlow = effect === 'gradient' || effect === 'rainbow';
                onStyle({
                  ...style,
                  effect,
                  animation:
                    effect === 'none' || (style.animation === 'flow' && !keepsFlow)
                      ? 'none'
                      : style.animation,
                });
              }}
            >
              {NAME_EFFECTS.map((e) => (
                <option key={e} value={e}>
                  {t(`effects.${e}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('nameAnimation')} description={t('nameAnimationDesc')}>
          {(p) => (
            <Select
              {...p}
              value={style.animation}
              disabled={style.effect === 'none'}
              onValueChange={(value) =>
                onStyle({ ...style, animation: value as NameStyle['animation'] })
              }
            >
              {NAME_ANIMATIONS.map((a) => (
                <option key={a} value={a} disabled={a === 'flow' && !flowing}>
                  {t(`animations.${a}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {style.effect === 'gradient' && (
        <Field label={t('secondColor')} description={t('secondColorDesc')}>
          {(p) => (
            <input
              {...p}
              type="color"
              value={style.color2 ?? '#22d3ee'}
              onChange={(e) => onStyle({ ...style, color2: e.target.value })}
              className="h-10 w-16 cursor-pointer rounded-ui border border-border bg-surface"
            />
          )}
        </Field>
      )}
      <div role="group" aria-label={t('preview')} className="grid gap-2 sm:grid-cols-2">
        {(['light', 'dark'] as const).map((scheme) => (
          <div
            key={scheme}
            className="flex items-center gap-2 rounded-ui border border-border px-3 py-2 text-base"
            // The community's own card colour for each colour set.
            style={{
              background: backdrops[scheme][1] ?? backdrops[scheme][0],
              color: readableOn(backdrops[scheme][1] ?? backdrops[scheme][0]!),
            }}
          >
            <span className="sr-only">{t(`preview${scheme === 'light' ? 'Light' : 'Dark'}`)}</span>
            <StyledName name={name} style={view} scheme={scheme} className="font-semibold" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{t('nametagNote')}</p>
    </fieldset>
  );
}
