'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

interface FieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Visually hide the label (still announced by screen readers). */
  hideLabel?: boolean;
  children: (props: FieldControlProps) => React.ReactNode;
}

/** Label + description + error, correctly wired to the control for assistive tech. */
export function Field({
  label,
  description,
  error,
  required,
  className,
  hideLabel,
  children,
}: FieldProps) {
  const id = React.useId();
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-sm font-semibold', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descId} className="text-sm text-muted">
          {description}
        </p>
      )}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}
      {error && (
        <p id={errId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
