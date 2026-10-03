import { LOGO, WORDMARK } from './brand-paths';

/**
 * The Game Central marks. `Logo` is the GC controller, black on light pages and white on dark
 * ones (the same drawing as app/icon.svg, the app icons and docs/brand); `Wordmark` is the name,
 * drawn as shapes so it looks the same whatever fonts someone has set. Their colours follow the
 * light, dark and high-contrast themes.
 */
export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={LOGO.viewBox}
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d={LOGO.d} fill="var(--mx-logo-mark)" />
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
