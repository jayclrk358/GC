import { getTranslations } from 'next-intl/server';
import { NavLink } from '@/components/shell/nav-link';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings');
  const links = [
    { href: '/settings/accessibility', label: t('accessibility') },
    { href: '/settings/account', label: t('account') },
    { href: '/settings/security', label: t('security') },
  ];
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:grid-cols-[14rem_1fr]">
      <nav aria-label={t('nav')}>
        <p className="mb-3 px-3 text-xs font-bold tracking-wide text-muted uppercase">
          {t('title')}
        </p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <NavLink href={l.href}>{l.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
