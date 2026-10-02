'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CONSENT_CHANGED, rememberTimeZone } from '@/lib/consent';

/**
 * Event times are laid out on the server in the viewer's time zone, which it learns from a
 * cookie. On a first visit (or after travelling) it guessed; this redraws the page once with the
 * browser's real zone. Only for people who allowed that cookie (now, or when they do).
 */
export function TimezoneSync({ serverZone }: { serverZone: string | null }) {
  const router = useRouter();
  React.useEffect(() => {
    const sync = () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone || zone === serverZone) return;
      if (rememberTimeZone()) router.refresh();
    };
    sync();
    window.addEventListener(CONSENT_CHANGED, sync);
    return () => window.removeEventListener(CONSENT_CHANGED, sync);
  }, [router, serverZone]);
  return null;
}
