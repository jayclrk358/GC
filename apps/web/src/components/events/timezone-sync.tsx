'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Event times are laid out on the server in the viewer's time zone, which it learns from a
 * cookie. On a first visit (or after travelling) it guessed; this redraws the page once with the
 * browser's real zone.
 */
export function TimezoneSync({ serverZone }: { serverZone: string | null }) {
  const router = useRouter();
  React.useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone === serverZone) return;
    document.cookie = `mx-tz=${encodeURIComponent(zone)};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }, [router, serverZone]);
  return null;
}
