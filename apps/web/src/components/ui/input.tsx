import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'w-full rounded-ui border border-muted/70 bg-surface px-3 py-2 text-base text-fg placeholder:text-muted/80 aria-[invalid=true]:border-danger disabled:opacity-60';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, 'h-10', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, 'min-h-24', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(inputClass, 'h-10 pe-8', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';
