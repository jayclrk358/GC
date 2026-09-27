import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export const backLinkClass =
  'mx-press group inline-flex w-fit items-center gap-1.5 rounded-ui-sm py-1 text-sm font-semibold text-muted hover:text-fg';

/** "← Back to …": a link to the page above this one (works the same however you got here). */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(backLinkClass, className)}>
      <ArrowLeft
        aria-hidden
        className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5"
      />
      {children}
    </Link>
  );
}
