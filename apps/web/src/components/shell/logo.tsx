/** The Magnox mark: a primary-to-accent tile with a controller-inspired "M". */
export function Logo({ size = 26, id = 'mx-logo' }: { size?: number; id?: string }) {
  const g = `${id}-g`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--c-primary)" />
          <stop offset="1" stopColor="var(--c-accent)" />
        </linearGradient>
      </defs>
      <path d="M6 1h20l5 5v20l-5 5H6l-5-5V6z" fill={`url(#${g})`} />
      <path
        d="M8 23V9.5l8 7 8-7V23"
        fill="none"
        stroke="var(--c-on-primary)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
