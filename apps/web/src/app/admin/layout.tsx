import { getTranslations } from 'next-intl/server';
import { newFeedbackCount, staffCan, type StaffAbility } from '@magnox/core';
import { staffFor } from '@/lib/staff';
import { NavLink } from '@/components/shell/nav-link';
import { ScrollList } from '@/components/ui/scroll-list';

export const metadata = { title: { default: 'Admin', template: '%s · Admin · Magnox' } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Not staff: the console doesn't exist as far as they're concerned.
  const staff = await staffFor('console');
  const t = await getTranslations('admin');
  const unread = staffCan(staff.role, 'feedback') ? await newFeedbackCount().catch(() => 0) : 0;
  const links: {
    href: string;
    label: string;
    ability: StaffAbility;
    exact?: boolean;
    count?: number;
  }[] = [
    { href: '/admin', label: t('nav.overview'), ability: 'console', exact: true },
    { href: '/admin/feedback', label: t('nav.feedback'), ability: 'feedback', count: unread },
    { href: '/admin/users', label: t('nav.users'), ability: 'users' },
    { href: '/admin/content', label: t('nav.content'), ability: 'content' },
    { href: '/admin/reports', label: t('nav.reports'), ability: 'reports' },
    { href: '/admin/communities', label: t('nav.communities'), ability: 'communities' },
    { href: '/admin/staff', label: t('nav.staff'), ability: 'staff' },
    { href: '/admin/log', label: t('nav.log'), ability: 'log' },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t('navLabel')}>
          <p className="mb-3 px-3 text-xs font-bold tracking-wide text-muted uppercase">
            {t('title')}
            <span className="mt-0.5 block font-medium tracking-normal normal-case">
              {t(`roles.${staff.role}`)}
            </span>
          </p>
          <ScrollList className="relative flex gap-1 overflow-x-auto md:flex-col">
            {links
              .filter((l) => staffCan(staff.role, l.ability))
              .map((l) => (
                <li key={l.href}>
                  <NavLink href={l.href} exact={l.exact}>
                    {l.label}
                    {l.count ? (
                      <span className="ms-2 rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary tabular-nums">
                        {l.count}
                        <span className="sr-only"> {t('newCount')}</span>
                      </span>
                    ) : null}
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
