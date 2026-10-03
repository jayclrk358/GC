import { WORDMARK } from './wordmark-paths';

/**
 * The Game Central marks. `Logo` is the D-pad tile (the same drawing as app/icon.svg, the app
 * icons and docs/brand); `Wordmark` is the name, drawn as shapes so it looks the same whatever
 * fonts someone has set, in colours that follow the light, dark and high-contrast themes.
 */

const TILE = '#6d28d9';

/** The tile's shapes, for any SVG 64 units square. A group (not a fragment) for link previews. */
export function Mark() {
  return (
    <g>
      <rect width="64" height="64" rx="16" fill={TILE} />
      <path
        d="M16 0H48A16 16 0 0 1 64 16V20L0 52V16A16 16 0 0 1 16 0Z"
        fill="#fff"
        fillOpacity=".08"
      />
      <path
        d="M28 9h8a3.5 3.5 0 0 1 3.5 3.5V24.5H51.5A3.5 3.5 0 0 1 55 28v8a3.5 3.5 0 0 1-3.5 3.5H39.5V51.5A3.5 3.5 0 0 1 36 55h-8a3.5 3.5 0 0 1-3.5-3.5V39.5H12.5A3.5 3.5 0 0 1 9 36v-8a3.5 3.5 0 0 1 3.5-3.5H24.5V12.5A3.5 3.5 0 0 1 28 9z"
        fill="#fff"
      />
      <path
        d="M32 12.5l3.4 4.6h-6.8zM32 51.5l3.4-4.6h-6.8zM12.5 32l4.6-3.4v6.8zM51.5 32l-4.6-3.4v6.8z"
        fill={TILE}
      />
      <circle cx="32" cy="32" r="6.5" fill={TILE} />
      <circle cx="32" cy="32" r="4.5" fill="#5eead4" />
    </g>
  );
}

export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={className}
    >
      <Mark />
    </svg>
  );
}

/** The name, "GAME CENTRAL". Sized by height through `className` (e.g. h-4); width follows. */
export function Wordmark({
  className,
  label = 'Game Central',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${WORDMARK.width} 100`}
      // An empty label means the link around it already names it.
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
      className={className}
      style={{ width: 'auto' }}
    >
      <path d={WORDMARK.game} fill="var(--mx-logo-ink)" />
      <path d={WORDMARK.central} fill="var(--mx-logo-accent)" />
    </svg>
  );
}
