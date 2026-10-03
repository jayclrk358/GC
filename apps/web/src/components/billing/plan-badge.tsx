import { Gem, Sparkles } from 'lucide-react';
import { planPerks, type PlanId } from '@gamecentral/shared';
import { cn } from '@/lib/utils';

/** "Plus" / "Pro" pill for communities on a paid plan (nothing for Free). */
export function PlanBadge({
  plan,
  label,
  className,
}: {
  plan: PlanId;
  /** The plan's name, translated. */
  label: string;
  className?: string;
}) {
  if (!planPerks(plan).badge) return null;
  const Icon = plan === 'pro' ? Gem : Sparkles;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
