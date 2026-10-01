import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { platformAdminFor } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { NavLink } from '@/components/shell/nav-link';
import { ScrollList } from '@/components/ui/scroll-list';

export const metadata = { title: { default: 'Admin', template: '%s · Admin · Magnox' } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Not an admin: the console doesn't exist as far as they're concerned.
  if (!(await platformAdminFor(user?.id ?? null))) notFound();
  const t = await getTranslations('admin');
  const links = [
    { href: '/admin', label: t('nav.overview'), exact: true },
    { href: '/admin/communities', label: t('nav.communities') },
    { href: '/admin/users', label: t('nav.users') },
    { href: '/admin/reports', label: t('nav.reports') },
    { href: '/admin/log', label: t('nav.log') },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t('navLabel')}>
          <p className="mb-3 px-3 text-xs font-bold tracking-wide text-muted uppercase">
            {t('title')}
          </p>
          <ScrollList className="relative flex gap-1 overflow-x-auto md:flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <NavLink href={l.href} exact={l.exact}>
                  {l.label}
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
