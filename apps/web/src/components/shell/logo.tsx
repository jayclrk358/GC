/**
 * The Magnox marks. `Logo` is the square pinwheel (favicon, small spaces); `Wordmark` is the full
 * "MAGNOX RESOURCES" logo. Drawn inline so the dark lettering can lighten in dark mode.
 */
export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#2e1065" />
      <g transform="translate(6,6) scale(0.2)">
        <polygon points="50,50 44,8 74,4 68,44" fill="#c9a3ff" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#9b6bff" transform="rotate(90,50,50)" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#6f3fd1" transform="rotate(180,50,50)" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#3d1a78" transform="rotate(270,50,50)" />
      </g>
    </svg>
  );
}

/** The full logo. Sized by height through `className` (e.g. h-5); width follows. */
export function Wordmark({
  className,
  label = 'Magnox Resources',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 1330 140"
      // An empty label means the link around it already names it.
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
      className={className}
      style={{ width: 'auto' }}
    >
      <g transform="translate(25,20)" fill="#9b6bff" stroke="#9b6bff">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="56" y="0" width="20" height="100" />
        <line x1="20" y1="10" x2="38" y2="60" strokeWidth="20" strokeLinecap="square" />
        <line x1="56" y1="10" x2="38" y2="60" strokeWidth="20" strokeLinecap="square" />
      </g>
      <g transform="translate(115,20)" fill="#9b6bff" stroke="#9b6bff">
        <line x1="32" y1="0" x2="4" y2="100" strokeWidth="20" strokeLinecap="square" />
        <line x1="32" y1="0" x2="60" y2="100" strokeWidth="20" strokeLinecap="square" />
        <rect x="14" y="55" width="36" height="18" />
      </g>
      <g transform="translate(193,20)" fill="#9b6bff">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="80" width="60" height="20" />
        <rect x="40" y="60" width="20" height="40" />
        <rect x="30" y="50" width="30" height="20" />
      </g>
      <g transform="translate(267,20)" fill="#9b6bff" stroke="#9b6bff">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="40" y="0" width="20" height="100" />
        <line x1="10" y1="0" x2="50" y2="100" strokeWidth="20" strokeLinecap="square" />
      </g>
      <g transform="translate(341,20)" fill="#9b6bff">
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="80" width="60" height="20" />
        <rect x="0" y="0" width="20" height="100" />
        <rect x="40" y="0" width="20" height="100" />
      </g>
      <g transform="translate(415,20)" stroke="#9b6bff">
        <line x1="0" y1="0" x2="60" y2="100" strokeWidth="20" strokeLinecap="square" />
        <line x1="60" y1="0" x2="0" y2="100" strokeWidth="20" strokeLinecap="square" />
      </g>
      <g transform="translate(510,20)">
        <polygon points="50,50 44,8 74,4 68,44" fill="#c9a3ff" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#9b6bff" transform="rotate(90,50,50)" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#6f3fd1" transform="rotate(180,50,50)" />
        <polygon
          points="50,50 44,8 74,4 68,44"
          fill="var(--mx-logo-ink)"
          transform="rotate(270,50,50)"
        />
      </g>
      <g transform="translate(645,20)" fill="var(--mx-logo-ink)" stroke="var(--mx-logo-ink)">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="0" width="54" height="20" />
        <rect x="34" y="0" width="20" height="50" />
        <rect x="0" y="40" width="54" height="20" />
        <line x1="24" y1="50" x2="60" y2="100" strokeWidth="20" strokeLinecap="square" />
      </g>
      <g transform="translate(719,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="0" width="50" height="20" />
        <rect x="0" y="80" width="50" height="20" />
        <rect x="0" y="42" width="42" height="16" />
      </g>
      <g transform="translate(793,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="0" width="20" height="50" />
        <rect x="0" y="40" width="60" height="20" />
        <rect x="40" y="50" width="20" height="50" />
        <rect x="0" y="80" width="60" height="20" />
      </g>
      <g transform="translate(867,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="80" width="60" height="20" />
        <rect x="0" y="0" width="20" height="100" />
        <rect x="40" y="0" width="20" height="100" />
      </g>
      <g transform="translate(941,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="20" height="80" />
        <rect x="40" y="0" width="20" height="80" />
        <rect x="0" y="80" width="60" height="20" />
      </g>
      <g transform="translate(1015,20)" fill="var(--mx-logo-ink)" stroke="var(--mx-logo-ink)">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="0" width="54" height="20" />
        <rect x="34" y="0" width="20" height="50" />
        <rect x="0" y="40" width="54" height="20" />
        <line x1="24" y1="50" x2="60" y2="100" strokeWidth="20" strokeLinecap="square" />
      </g>
      <g transform="translate(1089,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="80" width="60" height="20" />
      </g>
      <g transform="translate(1163,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="20" height="100" />
        <rect x="0" y="0" width="50" height="20" />
        <rect x="0" y="80" width="50" height="20" />
        <rect x="0" y="42" width="42" height="16" />
      </g>
      <g transform="translate(1237,20)" fill="var(--mx-logo-ink)">
        <rect x="0" y="0" width="60" height="20" />
        <rect x="0" y="0" width="20" height="50" />
        <rect x="0" y="40" width="60" height="20" />
        <rect x="40" y="50" width="20" height="50" />
        <rect x="0" y="80" width="60" height="20" />
      </g>
    </svg>
  );
}
