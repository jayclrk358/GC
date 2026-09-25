import * as React from 'react';
import { cn } from '@/lib/utils';

/** Every block with a heading becomes a labelled region. */
export function BlockSection({
  heading,
  children,
  className,
  id,
}: {
  heading?: string;
  children: React.ReactNode;
  className?: string;
  id: string;
}) {
  const headingId = heading ? `b-${id}-h` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-4', className)}>
      {heading && (
        <h2 id={headingId} className="text-xl font-bold sm:text-2xl">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}
