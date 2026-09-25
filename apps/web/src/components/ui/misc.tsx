import * as React from 'react';
import { cn, initials } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-ui-lg border border-border bg-surface p-5 text-fg', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'accent';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-fg border-border',
    primary: 'bg-primary/10 text-primary border-primary/40',
    success: 'bg-success/10 text-success border-success/40',
    danger: 'bg-danger/10 text-danger border-danger/40',
    warning: 'bg-warning/10 text-warning border-warning/40',
    accent: 'bg-accent/10 text-fg border-accent/50',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs',
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  src,
  name,
  size = 40,
  className,
  alt,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  /** Decorative by default (the name is usually shown next to it). */
  alt?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ''}
        width={size}
        height={size}
        style={style}
        className={cn('shrink-0 rounded-full bg-surface-2 object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden={alt ? undefined : true}
      role={alt ? 'img' : undefined}
      aria-label={alt}
      style={style}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-primary',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  live,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Announce to screen readers when it appears. */
  live?: boolean;
}) {
  const tones = {
    info: 'border-primary/50 bg-primary/5',
    success: 'border-success/60 bg-success/5',
    warning: 'border-warning/60 bg-warning/5',
    danger: 'border-danger/60 bg-danger/5',
  };
  return (
    <div
      role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
      className={cn('rounded-ui border border-s-4 px-4 py-3 text-sm', tones[tone], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-ui-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="mb-1 text-muted [&_svg]:size-8">
          {icon}
        </div>
      )}
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="max-w-md text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
