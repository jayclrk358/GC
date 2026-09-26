'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Navigation link that marks the current page with aria-current. */
export function NavLink({
  href,
  children,
  exact,
  also,
  className,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  /** Other path prefixes that belong to this section (e.g. threads belong to the forum tab). */
  also?: string[];
  className?: string;
}) {
  const pathname = usePathname();
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const active = (exact ? pathname === href : under(href)) || Boolean(also?.some(under));
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-ui-sm px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-muted hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg',
        className,
      )}
    >
      {children}
    </Link>
  );
}
