import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from './logo';

export async function SiteFooter() {
  const t = await getTranslations('shell');
  return (
    <footer className="mt-16 border-t border-border">
      <div className="flex flex-col gap-4 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>
            <span className="font-heading font-bold text-fg">Magnox</span> · {t('footerTagline')}
          </span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-4">
            <li>
              <Link href="/explore" className="transition-colors hover:text-fg">
                {t('explore')}
              </Link>
            </li>
            <li>
              <Link href="/servers" className="transition-colors hover:text-fg">
                {t('servers')}
              </Link>
            </li>
            <li>
              <Link href="/store" className="transition-colors hover:text-fg">
                {t('store')}
              </Link>
            </li>
            <li>
              <Link href="/settings/accessibility" className="transition-colors hover:text-fg">
                {t('accessibility')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
