'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog as D } from 'radix-ui';
import { Menu, X } from 'lucide-react';
import { SidebarContent, type SidebarCommunity } from './app-sidebar';

/** On small screens the sidebar lives in a sheet that slides in from the start edge. */
export function MobileNav({
  communities,
  signedIn,
}: {
  communities: SidebarCommunity[];
  signedIn: boolean;
}) {
  const t = useTranslations('shell');
  const [open, setOpen] = React.useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger
        className="mx-press grid size-9 place-items-center rounded-ui text-muted hover:bg-surface-2 hover:text-fg lg:hidden"
        aria-label={t('openMenu')}
      >
        <Menu className="size-5" aria-hidden />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="mx-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] lg:hidden" />
        <D.Content
          aria-describedby={undefined}
          className="mx-sheet fixed inset-y-0 start-0 z-50 flex w-[min(18rem,85vw)] flex-col border-e border-border bg-surface shadow-2xl lg:hidden"
        >
          <D.Title className="sr-only">{t('menu')}</D.Title>
          <SidebarContent
            communities={communities}
            signedIn={signedIn}
            collapsed={false}
            onNavigate={() => setOpen(false)}
          />
          <D.Close
            className="mx-press absolute end-2 top-3 grid size-8 place-items-center rounded-ui text-muted hover:bg-surface-2 hover:text-fg"
            aria-label={t('closeMenu')}
          >
            <X className="size-5" aria-hidden />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
