'use client';

import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = 'md',
  hideTitle,
  ...props
}: React.ComponentPropsWithoutRef<typeof D.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideTitle?: boolean;
}) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/55" />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-ui-lg border border-border bg-surface p-6 text-fg shadow-2xl',
          width,
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <D.Title className={cn('text-lg font-bold', hideTitle && 'sr-only')}>{title}</D.Title>
            {description && (
              <D.Description className="text-sm text-muted">{description}</D.Description>
            )}
          </div>
          <D.Close
            className="-m-1 rounded-ui p-1 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
