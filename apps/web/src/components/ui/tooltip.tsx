'use client';

import * as React from 'react';
import { Tooltip as T } from 'radix-ui';

export const TooltipProvider = T.Provider;

/** Supplementary hint. Never put essential information only in a tooltip. */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="mx-menu z-50 max-w-xs rounded-ui-sm bg-fg px-2.5 py-1.5 text-sm text-bg shadow-lg"
        >
          {content}
          <T.Arrow className="fill-fg" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
