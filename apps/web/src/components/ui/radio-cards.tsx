'use client';

import * as React from 'react';
import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface RadioCardOption<T extends string> {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
  preview?: React.ReactNode;
}

export function RadioCards<T extends string>({
  label,
  value,
  onValueChange,
  options,
  columns = 3,
  className,
}: {
  label: string;
  value: T;
  onValueChange: (v: T) => void;
  options: RadioCardOption<T>[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[
    columns
  ];
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={cn('grid grid-cols-1 gap-2', cols, className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className="flex flex-col items-start gap-1 rounded-ui border-2 border-border bg-surface p-3 text-start transition-colors hover:border-muted data-[state=checked]:border-primary data-[state=checked]:bg-primary/5"
        >
          {o.preview}
          <span className="flex w-full items-center justify-between gap-2 font-semibold">
            {o.label}
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-full border-2 border-muted"
            >
              <RadioGroup.Indicator className="size-2 rounded-full bg-primary" />
            </span>
          </span>
          {o.description && <span className="text-sm text-muted">{o.description}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
