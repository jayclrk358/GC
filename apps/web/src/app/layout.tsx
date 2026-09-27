import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { communitiesForUser } from '@magnox/core';
import { DEFAULT_THEME, prefsToHtmlAttributes, themeToCss } from '@magnox/shared';
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
import { mediaBase, mediaUrl } from '@/lib/media';
import { getPrefs } from '@/lib/prefs';
import { AppProviders } from '@/components/shell/app-providers';
import { SiteHeader } from '@/components/shell/site-header';
import { SiteFooter } from '@/components/shell/site-footer';
import { AppSidebar, type SidebarCommunity } from '@/components/shell/app-sidebar';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';

const SITE_TOKENS = themeToCss(DEFAULT_THEME, ':root', 'mx-tokens');

export const metadata: Metadata = {
  title: { default: 'Magnox', template: '%s · Magnox' },
  description: 'Customisable, accessible community hubs for games and game servers.',
  applicationName: 'Magnox',
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
  // The sidebar lists the communities you belong to, in the colours of each one's theme.
  const communities: SidebarCommunity[] = user
    ? (await communitiesForUser(user.id).catch(() => [])).slice(0, 40).map((c) => ({
        slug: c.slug,
        name: c.name,
        icon: mediaUrl(c.theme.iconKey),
        color: c.theme.light.primary,
        onColor: c.theme.light.onPrimary,
      }))
    : [];
  const collapsed = jar.get(SIDEBAR_COOKIE)?.value === 'collapsed';

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
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AppProviders prefs={prefs} signedIn={Boolean(user)}>
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
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
