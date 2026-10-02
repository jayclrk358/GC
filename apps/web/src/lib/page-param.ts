/** The furthest page any list goes to; deeper pages are too slow to be worth it. */
export const MAX_PAGE = 10_000;

/**
 * A `?page=` value as a page index: a whole number from 0 to MAX_PAGE. Anything else (missing,
 * negative, not a number, repeated) is page 0, and `?page=1e21` stays a sane SQL offset.
 */
export function pageParam(value: string | string[] | null | undefined): number {
  const n = typeof value === 'string' ? Math.floor(Number(value)) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAGE) : 0;
}
