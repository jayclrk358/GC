'use client';

import * as React from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-ui border border-border bg-surface p-1 text-fg shadow-xl',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-ui-sm px-2.5 py-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4',
        destructive && 'text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Label>) {
  return (
    <M.Label
      className={cn('px-2.5 py-1.5 text-xs font-semibold text-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export const DropdownMenuRadioGroup = M.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.RadioItem>) {
  return (
    <M.RadioItem
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-ui-sm px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-2 data-[state=checked]:font-semibold [&_svg]:size-4',
        className,
      )}
      {...props}
    >
      {children}
      <M.ItemIndicator className="ms-auto">
        <span aria-hidden className="block size-2 rounded-full bg-primary" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}
