'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Marks the community shell as "dense" on chat pages so the header slims down and chat fills
 * exactly the rest of the window (below the top bar), keeping the header in view. Layouts don't
 * re-render on client navigation, so this reads the path client-side.
 */
export function DenseOnChat({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const dense = pathname === `/c/${slug}/chat` || pathname.startsWith(`/c/${slug}/chat/`);
  return (
    <div
      data-dense={dense ? 'true' : 'false'}
      className={cn(
        'group/dense flex flex-1 flex-col',
        // 3.5rem is the top bar (plus its 1px border).
        dense && 'h-[calc(100dvh-3.5rem-1px)] min-h-[30rem] flex-none',
      )}
    >
      {children}
    </div>
  );
}
