import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from './logo';

export async function SiteFooter() {
  const t = await getTranslations('shell');
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>
            <span className="font-semibold text-fg">Magnox</span> · {t('footerTagline')}
          </span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-4">
            <li>
              <Link href="/explore" className="hover:text-fg">
                {t('explore')}
              </Link>
            </li>
            <li>
              <Link href="/servers" className="hover:text-fg">
                {t('servers')}
              </Link>
            </li>
            <li>
              <Link href="/settings/accessibility" className="hover:text-fg">
                {t('accessibility')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
