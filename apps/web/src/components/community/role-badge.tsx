import { cn } from '@/lib/utils';

/**
 * Role label with its colour. In colour-blind mode the dot becomes a lettered marker so roles can
 * be told apart without relying on colour.
 */
export function RoleBadge({
  name,
  color,
  colorblind,
  className,
}: {
  name: string;
  color: string | null;
  colorblind?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      {colorblind ? (
        <span
          aria-hidden
          className="grid size-4 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: color ?? 'var(--c-text-muted)' }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ background: color ?? 'var(--c-text-muted)' }}
        />
      )}
      {name}
    </span>
  );
}
