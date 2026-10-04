import type { EventFace } from '@gamecentral/core';
import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import type { EventTiming } from '@/lib/event-format';

/** A calendar-page tile: month, day and weekday. Decorative: the date is also said in words. */
export function DateTile({
  month,
  day,
  weekday,
  size = 'md',
  muted = false,
  className,
}: {
  month: string;
  day: string;
  weekday?: string;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-ui border text-center',
        muted ? 'border-border bg-surface-2 text-muted' : 'border-primary/25 bg-surface text-fg',
        size === 'sm' && 'w-12',
        size === 'md' && 'w-16',
        size === 'lg' && 'w-20',
        className,
      )}
    >
      <span
        className={cn(
          'w-full font-bold tracking-wide uppercase',
          muted ? 'bg-surface-2 text-muted' : 'bg-primary text-on-primary',
          size === 'sm' ? 'py-0.5 text-[0.625rem]' : 'py-1 text-xs',
        )}
      >
        {month}
      </span>
      <span
        className={cn(
          'leading-none font-bold tabular-nums',
          size === 'sm' && 'pt-1 text-lg',
          size === 'md' && 'pt-1.5 text-2xl',
          size === 'lg' && 'pt-2 text-3xl',
          !weekday && (size === 'sm' ? 'pb-1.5' : 'pb-2'),
        )}
      >
        {day}
      </span>
      {weekday && (
        <span
          className={cn('text-muted', size === 'sm' ? 'pb-1 text-[0.625rem]' : 'pb-1.5 text-xs')}
        >
          {weekday}
        </span>
      )}
    </div>
  );
}

/** Overlapping faces of people going, and "+N" for the rest. */
export function FaceStack({
  faces,
  total,
  size = 28,
  label,
}: {
  faces: EventFace[];
  /** Everyone going, faces or not. */
  total: number;
  size?: number;
  /** Read out in place of the faces ("9 going"). */
  label: string;
}) {
  if (total === 0) return null;
  const more = total - faces.length;
  return (
    <span role="img" aria-label={label} className="flex items-center">
      {faces.map((f, i) => (
        <Avatar
          key={f.id}
          src={f.image}
          name={f.name}
          size={size}
          className={cn('ring-2 ring-surface', i > 0 && '-ms-2')}
        />
      ))}
      {more > 0 && (
        <span
          aria-hidden
          style={{ height: size, minWidth: size }}
          className="-ms-2 inline-grid place-items-center rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-muted ring-2 ring-surface"
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/** How full an event is, as a bar. The words beside it say the same for screen readers. */
export function PlacesBar({ taken, capacity }: { taken: number; capacity: number }) {
  if (capacity <= 0) return null;
  const share = Math.min(1, taken / capacity);
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <span
        className={cn(
          'block h-full rounded-full',
          share >= 1 ? 'bg-warning' : share >= 0.75 ? 'bg-accent' : 'bg-primary',
        )}
        style={{ width: `${Math.max(share * 100, taken > 0 ? 4 : 0)}%` }}
      />
    </span>
  );
}

/** "Happening now" with a live dot, or "Starts tomorrow". */
export function TimingBadge({
  timing,
  labels,
  className,
}: {
  timing: EventTiming;
  labels: { now: string; startsIn: (when: string) => string; ended: string };
  className?: string;
}) {
  const now = timing.state === 'now';
  const text =
    timing.state === 'now'
      ? labels.now
      : timing.state === 'ended'
        ? labels.ended
        : labels.startsIn(timing.when);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        now
          ? 'bg-success/15 text-success'
          : timing.state === 'soon'
            ? 'bg-warning/15 text-fg'
            : timing.state === 'ended'
              ? 'bg-surface-2 text-muted'
              : 'bg-primary/12 text-primary',
        className,
      )}
    >
      {now && (
        <span aria-hidden className="mx-live-dot inline-flex">
          <span className="size-2 rounded-full bg-current" />
        </span>
      )}
      {text}
    </span>
  );
}
