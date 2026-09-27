'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Secondary filters: always shown in the desktop filter column, folded behind a toggle on small
 * screens so the results aren't pushed off the first screen.
 */
export function FilterDisclosure({
  active,
  children,
}: {
  /** How many of the folded filters are set, shown on the toggle. */
  active: number;
  children: React.ReactNode;
}) {
  const t = useTranslations('common');
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="mx-press flex h-9 items-center gap-2 rounded-ui border border-border px-3 text-sm font-medium hover:bg-surface-2 lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t('moreFilters')}
        {active > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary">
            {active}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn('ms-auto size-4 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      <div id={id} className={cn('flex flex-col gap-4', !open && 'max-lg:hidden')}>
        {children}
      </div>
    </>
  );
}
