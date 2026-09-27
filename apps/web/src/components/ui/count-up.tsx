import type { CSSProperties } from 'react';

/**
 * A number that counts up from zero when it first appears (CSS only, so it's right from the
 * first paint). Screen readers get the real, formatted value; large numbers stay static because
 * the animated counter can't show thousands separators.
 */
export function CountUp({
  value,
  formatted,
  className,
}: {
  value: number;
  formatted: string;
  className?: string;
}) {
  if (value >= 1000 || value < 0) return <span className={className}>{formatted}</span>;
  return (
    <span className={className}>
      <span aria-hidden className="mx-count" style={{ '--mx-to': value } as CSSProperties} />
      <span className="sr-only">{formatted}</span>
    </span>
  );
}
