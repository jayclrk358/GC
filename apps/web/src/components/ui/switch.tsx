'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-muted bg-surface-2 transition-colors disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-muted transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-on-primary" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

/** A labelled switch row with an optional description. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  name,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
      />
    </div>
  );
}
