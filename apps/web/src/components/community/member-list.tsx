import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Crown, Users } from 'lucide-react';
import type { MemberRow, RoleSummary } from '@magnox/core';
import { Avatar, EmptyState } from '@/components/ui/misc';
import { RoleBadge } from './role-badge';

export async function MemberList({
  members,
  roles,
  colorblind,
  query,
}: {
  members: MemberRow[];
  roles: RoleSummary[];
  colorblind: boolean;
  query: string;
}) {
  const t = await getTranslations('community');
  if (members.length === 0) {
    return <EmptyState icon={<Users />} title={query ? t('noMembersFound') : t('noMembers')} />;
  }
  const byId = new Map(roles.map((r) => [r.id, r]));
  // Group by the highest hoisted role, like a server member list.
  const hoisted = roles.filter((r) => r.hoist && !r.isDefault);
  const groups = new Map<string, MemberRow[]>();
  for (const m of members) {
    const top = hoisted.find((r) => m.roleIds.includes(r.id));
    const key = top?.id ?? 'members';
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const order = [...hoisted.map((r) => r.id), 'members'].filter((k) => groups.has(k));

  return (
    <div className="flex flex-col gap-8">
      {order.map((key) => {
        const role = byId.get(key);
        const list = groups.get(key)!;
        const headingId = `group-${key}`;
        return (
          <section key={key} aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">
              {role ? role.name : t('tabs.members')} — {list.length}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 rounded-ui border border-border bg-surface p-3">
                  <Avatar src={m.image} name={m.nickname || m.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-semibold">
                      {m.username ? (
                        <Link href={`/u/${m.username}`} className="hover:underline">
                          {m.nickname || m.name}
                        </Link>
                      ) : (
                        (m.nickname || m.name)
                      )}
                      {m.isOwner && <Crown className="size-4 text-warning" aria-label={t('owner')} role="img" />}
                    </p>
                    {m.username && <p className="truncate text-sm text-muted">@{m.username}</p>}
                    {m.roleIds.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-1" aria-label={t('roles')}>
                        {m.roleIds
                          .map((id) => byId.get(id))
                          .filter((r): r is RoleSummary => Boolean(r))
                          .sort((a, b) => b.position - a.position)
                          .slice(0, 4)
                          .map((r) => (
                            <li key={r.id}>
                              <RoleBadge name={r.name} color={r.color} colorblind={colorblind} />
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
