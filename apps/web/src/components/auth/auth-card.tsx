import { Logo } from '@/components/shell/logo';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="rounded-ui-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo size={40} />
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
