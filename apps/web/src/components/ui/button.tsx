import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'mx-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ui font-semibold select-none disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary/88',
        secondary: 'bg-surface-2 text-fg hover:bg-surface-2/70 border border-border',
        outline: 'border border-border bg-transparent text-fg hover:bg-surface-2',
        ghost: 'bg-transparent text-fg hover:bg-surface-2',
        danger: 'bg-danger text-bg hover:bg-danger/90',
        /** Launching a game: green, like a play button in a game launcher. */
        play: 'bg-success text-bg hover:bg-success/90',
        link: 'bg-transparent text-primary underline underline-offset-2 hover:no-underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
