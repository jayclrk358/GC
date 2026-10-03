'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CONSENT_CHANGED,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  consentValue,
  forgetTimeZone,
  rememberTimeZone,
  type CookieChoice,
} from '@/lib/consent';

const OPEN_EVENT = 'mx-cookie-settings';

/** Show the cookie choice again, e.g. from the footer or the privacy policy. */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Asks first-time visitors about cookies: everything, or only what Game Central needs to work. Not a
 * dialog: the page stays usable around it, and it's a labelled region screen readers can find.
 */
export function CookieBanner({ initialChoice }: { initialChoice: CookieChoice | null }) {
  const t = useTranslations('cookies');
  const [choice, setChoice] = React.useState(initialChoice);
  const [open, setOpen] = React.useState(initialChoice === null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  // Opened on request: focus goes to it, and back to where it came from afterwards.
  const returnTo = React.useRef<HTMLElement | null>(null);
  const focusOnOpen = React.useRef(false);

  React.useEffect(() => {
    const onOpen = () => {
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focusOnOpen.current = true;
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  React.useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      heading.current?.focus();
    }
  }, [open]);

  function choose(next: CookieChoice) {
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${consentValue(next)}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`;
    if (next === 'all') rememberTimeZone();
    else forgetTimeZone();
    window.dispatchEvent(new Event(CONSENT_CHANGED));
    if (choice !== null) toast.success(t('saved'));
    setChoice(next);
    setOpen(false);
    returnTo.current?.focus();
    returnTo.current = null;
  }

  if (!open) return null;
  return (
    <section
      aria-labelledby="cookie-banner-h"
      className="mx-page-enter fixed inset-x-3 bottom-3 z-40 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xl sm:inset-x-auto sm:end-4 sm:bottom-4 sm:max-w-md print:hidden"
    >
      <h2
        id="cookie-banner-h"
        ref={heading}
        tabIndex={-1}
        className="flex items-center gap-2 font-heading text-base font-bold outline-none"
      >
        <Cookie aria-hidden className="size-5 text-primary" />
        {t('title')}
      </h2>
      <p className="text-sm text-muted">
        {t('body')}{' '}
        <Link
          href="/legal/privacy#cookies"
          className="font-medium text-fg underline underline-offset-2"
        >
          {t('details')}
        </Link>
      </p>
      {choice && (
        <p className="text-sm">{choice === 'all' ? t('currentAll') : t('currentNecessary')}</p>
      )}
      {/* Both answers are as easy as each other. */}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => choose('all')}>{t('acceptAll')}</Button>
        <Button variant="secondary" onClick={() => choose('necessary')}>
          {t('necessaryOnly')}
        </Button>
      </div>
    </section>
  );
}

/** A link-like button that brings the cookie choice back. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations('cookies');
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {t('settings')}
    </button>
  );
}
