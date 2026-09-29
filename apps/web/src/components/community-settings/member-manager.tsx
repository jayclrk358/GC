'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Crown, Tags } from 'lucide-react';
import type { RoleSummary } from '@magnox/core';
import { nameStyleView, pickRoleDecor, type DecorPerks, type NameBackdrops } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, EmptyState } from '@/components/ui/misc';
import { RoleBadge } from '@/components/community/role-badge';
import { StyledName } from '@/components/community/role-decor';
import { setMemberRoleAction } from '@/app/actions/roles';
import { MemberModActions } from '@/components/moderation/member-mod-actions';
import { formatDateTime } from '@/lib/format';

interface Member {
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  roleIds: string[];
  isOwner: boolean;
  timeoutUntil: string | null;
}

export function MemberManager({
  communityId,
  members,
  roles,
  actor,
  can,
  backdrops,
  perks,
}: {
  communityId: string;
  members: Member[];
  roles: RoleSummary[];
  /** The community's backgrounds, so nametag colours stay readable. */
  backdrops: NameBackdrops;
  /** What the community's plan shows (name effects, role icons). */
  perks: DecorPerks;
  actor: { isOwner: boolean; topPosition: number; userId: string };
  can: { roles: boolean; kick: boolean; ban: boolean; timeout: boolean };
}) {
  const t = useTranslations('roles');
  const router = useRouter();
  const [editing, setEditing] = React.useState<Member | null>(null);
  const [pendingRole, setPendingRole] = React.useState<string | null>(null);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const topOf = (m: Member) => Math.max(0, ...m.roleIds.map((id) => byId.get(id)?.position ?? 0));
  const canEditMember = (m: Member) =>
    actor.isOwner || m.userId === actor.userId || (!m.isOwner && topOf(m) < actor.topPosition);
  const outranks = (m: Member) =>
    m.userId !== actor.userId && !m.isOwner && (actor.isOwner || topOf(m) < actor.topPosition);
  const canAssign = (r: RoleSummary) => actor.isOwner || r.position < actor.topPosition;

  if (!members.length) return <EmptyState title={t('noMembers')} />;

  async function toggle(member: Member, role: RoleSummary, on: boolean) {
    // Update immediately so the checkbox responds; roll back if the server refuses.
    const next = {
      ...member,
      roleIds: on ? [...member.roleIds, role.id] : member.roleIds.filter((x) => x !== role.id),
    };
    setEditing(next);
    setPendingRole(role.id);
    const r = await setMemberRoleAction(communityId, member.userId, role.id, on);
    setPendingRole(null);
    if (r.ok) router.refresh();
    else {
      setEditing(member);
      toast.error(r.error);
    }
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-ui-lg border border-border bg-surface">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
            <Avatar src={m.image} name={m.name} size={36} presence={m.userId} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-semibold">
                <StyledName
                  name={m.name}
                  style={
                    pickRoleDecor(
                      m.roleIds
                        .map((id) => byId.get(id))
                        .filter((r): r is RoleSummary => Boolean(r)),
                      backdrops,
                      perks,
                    ).nameStyle
                  }
                />
                {m.isOwner && (
                  <Crown className="size-4 text-warning" aria-label={t('owner')} role="img" />
                )}
              </p>
              {m.username && <p className="text-sm text-muted">@{m.username}</p>}
              {m.timeoutUntil && new Date(m.timeoutUntil) > new Date() && (
                <p className="text-sm font-medium text-warning">
                  {t('timedOutUntil', { date: formatDateTime(m.timeoutUntil) })}
                </p>
              )}
            </div>
            <ul className="flex flex-wrap gap-1" aria-label={t('rolesOf', { name: m.name })}>
              {m.roleIds
                .map((id) => byId.get(id))
                .filter((r): r is RoleSummary => Boolean(r))
                .map((r) => (
                  <li key={r.id}>
                    <RoleBadge
                      name={r.name}
                      color={r.color}
                      iconUrl={perks.roleIcons ? r.iconUrl : null}
                      style={nameStyleView(r.color, r.badgeStyle, backdrops, perks)}
                    />
                  </li>
                ))}
            </ul>
            {outranks(m) && (
              <MemberModActions
                communityId={communityId}
                member={{ userId: m.userId, name: m.name, timeoutUntil: m.timeoutUntil }}
                can={{ kick: can.kick, ban: can.ban, timeout: can.timeout }}
              />
            )}
            {can.roles && canEditMember(m) && (
              <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                <Tags aria-hidden /> {t('manageRoles')}
                <span className="sr-only"> {m.name}</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={t('rolesFor', { name: editing.name })} size="sm">
            <fieldset>
              <legend className="sr-only">{t('rolesFor', { name: editing.name })}</legend>
              <ul className="flex flex-col gap-2">
                {roles.map((r) => (
                  <li key={r.id}>
                    <label className="flex items-center gap-3 rounded-ui border border-border px-3 py-2 has-[:disabled]:opacity-60">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--c-primary)]"
                        checked={editing.roleIds.includes(r.id)}
                        disabled={!canAssign(r)}
                        aria-busy={pendingRole === r.id || undefined}
                        onChange={(e) => void toggle(editing, r, e.target.checked)}
                      />
                      <RoleBadge
                        name={r.name}
                        color={r.color}
                        iconUrl={perks.roleIcons ? r.iconUrl : null}
                        style={nameStyleView(r.color, r.badgeStyle, backdrops, perks)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
