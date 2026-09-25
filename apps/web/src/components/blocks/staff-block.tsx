import Link from 'next/link';
import { listRoles, membersWithRoles } from '@magnox/core';
import type { BlockConfig } from '@magnox/shared';
import type { LoadedCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { Avatar } from '@/components/ui/misc';
import { RoleBadge } from '@/components/community/role-badge';
import { BlockSection } from './section';

export async function StaffBlock({ id, config, data }: { id: string; config: BlockConfig<'staff'>; data: LoadedCommunity }) {
  const roles = await listRoles(data.community.id);
  const roleIds = config.roleIds.length ? config.roleIds : roles.filter((r) => r.hoist && !r.isDefault).map((r) => r.id);
  const [people, prefs] = await Promise.all([membersWithRoles(data.community.id, roleIds), getPrefs()]);
  if (!people.length) return null;
  const byId = new Map(roles.map((r) => [r.id, r]));
  const sorted = [...people].sort((a, b) => (byId.get(b.roleId)?.position ?? 0) - (byId.get(a.roleId)?.position ?? 0));
  return (
    <BlockSection id={id} heading={config.heading}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sorted.map((p) => {
          const role = byId.get(p.roleId);
          return (
            <li key={p.userId} className="flex items-center gap-3 rounded-ui border border-border bg-surface p-3">
              <Avatar src={p.image} name={p.nickname || p.name} size={44} />
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {p.username ? <Link href={`/u/${p.username}`}>{p.nickname || p.name}</Link> : p.nickname || p.name}
                </p>
                {role && <RoleBadge name={role.name} color={role.color} colorblind={prefs.colorblindRoleColors} />}
              </div>
            </li>
          );
        })}
      </ul>
    </BlockSection>
  );
}
