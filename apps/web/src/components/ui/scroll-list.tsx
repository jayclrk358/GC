'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

/**
 * A list that scrolls sideways on small screens (settings tabs, for example) and keeps the
 * current page's link in view, so the active tab isn't hidden off the edge.
 */
export function ScrollList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLUListElement>(null);
  const pathname = usePathname();
  React.useEffect(() => {
    const list = ref.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const item = current.closest('li') ?? current;
    list.scrollLeft = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
  }, [pathname]);
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
