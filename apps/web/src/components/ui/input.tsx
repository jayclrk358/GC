import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './control-styles';

export { inputClass };
export { Select, type SelectProps } from './select';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      inputClass,
      'h-10',
      // File pickers get a button that matches the rest of the form.
      'file:me-3 file:cursor-pointer file:rounded-ui-sm file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-fg',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, 'min-h-24 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';
