'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { backLinkClass } from './back-link';

// Pages seen in this tab since it loaded. More than one means Back stays on this site.
let visits = 0;
let lastPath: string | null = null;

/** Counts in-site navigations; mounted once in the app shell. */
export function NavigationTracker() {
  const pathname = usePathname();
  React.useEffect(() => {
    // Count real page changes only (effects can run twice for the same page in development).
    if (pathname === lastPath) return;
    lastPath = pathname;
    visits++;
  }, [pathname]);
  return null;
}

/**
 * Back to wherever you came from on this site, like the browser's Back button. Opened from
 * outside (a shared link, a new tab), it goes to `fallback` instead of leaving the site.
 */
export function HistoryBack({ fallback, className }: { fallback: string; className?: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={cn(backLinkClass, className)}
      onClick={(e) => {
        if (visits > 1 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <ArrowLeft
        aria-hidden
        className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5"
      />
      {t('back')}
    </Link>
  );
}
