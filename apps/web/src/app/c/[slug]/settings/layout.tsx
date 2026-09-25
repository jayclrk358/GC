import { getTranslations } from 'next-intl/server';
import { loadCommunityForSettings } from '@/lib/community';
import { NavLink } from '@/components/shell/nav-link';

export default async function CommunitySettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { perms, ctx } = await loadCommunityForSettings(slug);
  const t = await getTranslations('csettings');
  const base = `/c/${slug}/settings`;
  const links = [
    { href: base, label: t('nav.general'), show: perms.manage, exact: true },
    { href: `${base}/appearance`, label: t('nav.appearance'), show: perms.manage },
    { href: `${base}/page`, label: t('nav.page'), show: perms.manage },
    { href: `${base}/navigation`, label: t('nav.navigation'), show: perms.manage },
    { href: `${base}/roles`, label: t('nav.roles'), show: perms.manageRoles },
    { href: `${base}/members`, label: t('nav.members'), show: perms.manageRoles },
    { href: `${base}/invites`, label: t('nav.invites'), show: perms.manageInvites || perms.createInvite },
    { href: `${base}/servers`, label: t('nav.servers'), show: perms.manageServers },
    { href: `${base}/audit`, label: t('nav.audit'), show: perms.viewAudit },
    { href: `${base}/danger`, label: t('nav.danger'), show: ctx.isOwner },
  ].filter((l) => l.show);
  return (
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <nav aria-label={t('navLabel')}>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <NavLink href={l.href} exact={l.exact}>
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
