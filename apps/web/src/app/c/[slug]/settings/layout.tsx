import { getTranslations } from 'next-intl/server';
import { openReportCount } from '@magnox/core';
import { loadCommunityForSettings } from '@/lib/community';
import { NavLink } from '@/components/shell/nav-link';
import { BackLink } from '@/components/ui/back-link';
import { ScrollList } from '@/components/ui/scroll-list';

export default async function CommunitySettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { perms, ctx, community } = await loadCommunityForSettings(slug);
  const t = await getTranslations('csettings');
  const tBack = await getTranslations('common');
  const reports = perms.manageReports ? await openReportCount(ctx) : 0;
  const base = `/c/${slug}/settings`;
  const links = [
    { href: base, label: t('nav.general'), show: perms.manage, exact: true },
    { href: `${base}/appearance`, label: t('nav.appearance'), show: perms.manage },
    { href: `${base}/page`, label: t('nav.page'), show: perms.manage },
    { href: `${base}/navigation`, label: t('nav.navigation'), show: perms.manage },
    { href: `${base}/roles`, label: t('nav.roles'), show: perms.manageRoles },
    { href: `${base}/channels`, label: t('nav.channels'), show: perms.manageChannels },
    {
      href: `${base}/members`,
      label: t('nav.members'),
      show: perms.manageRoles || perms.kick || perms.ban || perms.timeout,
    },
    { href: `${base}/reports`, label: t('nav.reports'), show: perms.manageReports, badge: reports },
    { href: `${base}/bans`, label: t('nav.bans'), show: perms.ban },
    {
      href: `${base}/invites`,
      label: t('nav.invites'),
      show: perms.manageInvites || perms.createInvite,
    },
    { href: `${base}/servers`, label: t('nav.servers'), show: perms.manageServers },
    { href: `${base}/audit`, label: t('nav.audit'), show: perms.viewAudit },
    { href: `${base}/danger`, label: t('nav.danger'), show: ctx.isOwner },
  ].filter((l) => l.show);
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/c/${slug}`}>{tBack('backTo', { name: community.name })}</BackLink>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t('navLabel')}>
          <ScrollList className="relative flex gap-1 overflow-x-auto md:flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <NavLink href={l.href} exact={l.exact}>
                  <span className="flex items-center justify-between gap-2">
                    {l.label}
                    {'badge' in l && l.badge ? (
                      <span className="rounded-full bg-danger px-1.5 text-xs text-bg">
                        {l.badge}
                        <span className="sr-only"> {t('openReports')}</span>
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              </li>
            ))}
          </ScrollList>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
