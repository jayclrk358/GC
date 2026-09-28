import type { NameStyleView } from '@magnox/shared';
import { cn } from '@/lib/utils';
import { RoleIcon, StyledName } from './role-decor';

/**
 * Role label with its colour. In colour-blind mode the dot becomes a lettered marker so roles can
 * be told apart without relying on colour.
 */
export function RoleBadge({
  name,
  color,
  iconUrl,
  colorblind,
  style,
  scheme,
  className,
}: {
  name: string;
  color: string | null;
  /** The role's icon image; it replaces the colour dot (and tells roles apart on its own). */
  iconUrl?: string | null;
  colorblind?: boolean;
  /** The role's own nametag style, so its name looks the way members' names do. */
  style?: NameStyleView | null;
  /** Force light or dark colours (previews). */
  scheme?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      {iconUrl ? (
        <RoleIcon url={iconUrl} />
      ) : colorblind ? (
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
      <StyledName name={name} style={style} scheme={scheme} />
    </span>
  );
}
