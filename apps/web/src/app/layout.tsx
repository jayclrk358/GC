import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { communitiesForUser, getConsent } from '@gamecentral/core';
import {
  CURRENT_TERMS_VERSION,
  DEFAULT_THEME,
  prefsToHtmlAttributes,
  themeToCss,
} from '@gamecentral/shared';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/lora';
import '@fontsource-variable/nunito';
import '@fontsource-variable/oxanium';
import '@fontsource-variable/exo-2';
import '@fontsource-variable/space-grotesk';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import './globals.css';
import { getUser } from '@/lib/auth';
import { MEDIA_FALLBACK, mediaBase } from '@/lib/media';
import { getPrefs } from '@/lib/prefs';
import { AppProviders } from '@/components/shell/app-providers';
import { SiteHeader } from '@/components/shell/site-header';
import { SiteFooter } from '@/components/shell/site-footer';
import { AutoRefresh } from '@/components/live/live';
import { AppSidebar, type SidebarCommunity } from '@/components/shell/app-sidebar';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { CONSENT_COOKIE, parseConsent } from '@/lib/consent';
import { CookieBanner } from '@/components/shell/cookie-banner';

const SITE_TOKENS = themeToCss(DEFAULT_THEME, ':root', 'mx-tokens');

// Tell the server the browser's time zone (a cookie), so event times show on the viewer's clock.
// Only for visitors who allowed optional cookies.
const TZ_SCRIPT = `try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z&&document.cookie.indexOf('mx-tz='+encodeURIComponent(z))<0)document.cookie='mx-tz='+encodeURIComponent(z)+';path=/;max-age=31536000;samesite=lax'}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Game Central', template: '%s · Game Central' },
  description: 'Customisable, accessible community hubs for games and game servers.',
  applicationName: 'Game Central',
  openGraph: { siteName: 'Game Central', type: 'website' },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { capable: true, title: 'Game Central', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4fb' },
    { media: '(prefers-color-scheme: dark)', color: '#07080f' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [prefs, user, locale, t, h, jar] = await Promise.all([
    getPrefs(),
    getUser(),
    getLocale(),
    getTranslations('shell'),
    headers(),
    cookies(),
  ]);
  const nonce = h.get('x-nonce') ?? undefined;
  // Signed in but not yet agreed to the (current) terms: that comes first.
  if (user) {
    const path = h.get('x-pathname') ?? '/';
    const open = path === '/accept-terms' || path.startsWith('/legal/');
    if (!open && (await getConsent(user.id)).termsVersion < CURRENT_TERMS_VERSION) {
      // With the query, so where they were going (a sign-in for the Windows app, say) survives.
      const search = h.get('x-search') ?? '';
      redirect(`/accept-terms?next=${encodeURIComponent(path + search)}`);
    }
  }
  // The sidebar lists the communities you belong to, in the colours of each one's theme.
  const communities: SidebarCommunity[] = user
    ? (await communitiesForUser(user.id).catch(() => [])).slice(0, 40).map((c) => ({
        slug: c.slug,
        name: c.name,
        iconKey: c.theme.iconKey ?? null,
        color: c.theme.light.primary,
        onColor: c.theme.light.onPrimary,
      }))
    : [];
  const collapsed = jar.get(SIDEBAR_COOKIE)?.value === 'collapsed';
  const cookieChoice = parseConsent(jar.get(CONSENT_COOKIE)?.value);

  return (
    <html
      lang={locale}
      {...prefsToHtmlAttributes(prefs)}
      style={{ fontSize: `${prefs.fontScale}%` }}
      suppressHydrationWarning
    >
      <head>
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: SITE_TOKENS }} />
        <meta name="mx-media-base" content={mediaBase()} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MEDIA_FALLBACK }} />
        {cookieChoice === 'all' && (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: TZ_SCRIPT }} />
        )}
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AppProviders prefs={prefs} signedIn={Boolean(user)}>
            <AutoRefresh />
            <a href="#main" className="skip-link">
              {t('skipToContent')}
            </a>
            <div className="flex min-h-dvh">
              <AppSidebar
                communities={communities}
                signedIn={Boolean(user)}
                initialCollapsed={collapsed}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <SiteHeader user={user} communities={communities} />
                <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
                  {children}
                </main>
                <SiteFooter />
              </div>
            </div>
            <CookieBanner initialChoice={cookieChoice} />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
