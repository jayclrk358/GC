import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CookieSettingsButton } from './cookie-banner';
import { Logo } from './logo';

export async function SiteFooter() {
  const t = await getTranslations('shell');
  return (
    <footer className="mt-16 border-t border-border" data-site-footer>
      <div className="flex flex-col gap-4 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>
            <span className="font-heading font-bold text-fg">Game Central</span> ·{' '}
            {t('footerTagline')}
          </span>
        </div>
        <nav aria-label={t('footerNav')}>
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
            <li>
              <Link href="/developers" className="transition-colors hover:text-fg">
                {t('developers')}
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className="transition-colors hover:text-fg">
                {t('terms')}
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="transition-colors hover:text-fg">
                {t('privacyPolicy')}
              </Link>
            </li>
            <li>
              <Link href="/feedback" className="transition-colors hover:text-fg">
                {t('feedback')}
              </Link>
            </li>
            <li>
              <CookieSettingsButton className="transition-colors hover:text-fg" />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
