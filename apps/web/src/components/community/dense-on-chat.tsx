'use client';

import { usePathname } from 'next/navigation';

/**
 * Marks the community shell as "dense" on chat pages so the header slims down and chat can fill
 * the screen. Layouts don't re-render on client navigation, so this reads the path client-side.
 */
export function DenseOnChat({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const dense = pathname === `/c/${slug}/chat` || pathname.startsWith(`/c/${slug}/chat/`);
  return (
    <div data-dense={dense ? 'true' : 'false'} className="group/dense flex flex-1 flex-col">
      {children}
    </div>
  );
}
