import { useTranslations } from 'next-intl';
import { Crown, Shield, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { StaffRole } from '@magnox/core';
import { cn } from '@/lib/utils';

const STYLE: Record<StaffRole, { icon: LucideIcon; className: string }> = {
  owner: { icon: Crown, className: 'border-primary bg-primary text-on-primary' },
  admin: { icon: ShieldCheck, className: 'border-primary/40 bg-primary/10 text-primary' },
  moderator: { icon: Shield, className: 'border-border bg-surface-2 text-fg' },
};

/** Marks someone on the team that runs Magnox, wherever their profile is shown. */
export function StaffBadge({ role, className }: { role: StaffRole; className?: string }) {
  const t = useTranslations('staffBadge');
  const { icon: Icon, className: tone } = STYLE[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold',
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {t(role)}
    </span>
  );
}
