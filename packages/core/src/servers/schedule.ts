/** Game server polling tiers and backoff. Pure functions so they can be unit tested. */

export const POLL = {
  hotMs: 60_000,
  normalMs: 5 * 60_000,
  maxBackoffMs: 60 * 60_000,
  dormantAfterMs: 7 * 24 * 60 * 60_000,
  hotWindowMs: 10 * 60_000,
  /** Manual refreshes within this window reuse the cached result. */
  refreshCacheMs: 30_000,
  alertAfterFailures: 3,
} as const;

export interface PollState {
  ok: boolean;
  /** Consecutive failures including this one (0 when ok). */
  failCount: number;
  /** Someone is viewing it right now, or it was just added/refreshed. */
  hot: boolean;
  /** Verified or publicly listed servers are polled more often. */
  important: boolean;
}

export function baseInterval(s: Pick<PollState, 'hot' | 'important'>): number {
  return s.hot || s.important ? POLL.hotMs : POLL.normalMs;
}

/** Delay until the next poll. `jitter` in [-1, 1] spreads load (±10%). */
export function nextPollDelay(s: PollState, jitter = 0): number {
  const base = baseInterval(s);
  const raw = s.ok ? base : Math.min(POLL.maxBackoffMs, base * 2 ** Math.max(0, s.failCount - 1));
  const j = Math.max(-1, Math.min(1, jitter));
  return Math.round(raw * (1 + 0.1 * j));
}

export function shouldGoDormant(opts: {
  lastOnlineAt: Date | null;
  createdAt: Date;
  now: Date;
}): boolean {
  const since = opts.lastOnlineAt ?? opts.createdAt;
  return opts.now.getTime() - since.getTime() >= POLL.dormantAfterMs;
}

/** Strip Minecraft formatting codes (§x) and control characters from server-reported text. */
export function cleanServerText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/§[0-9a-fk-or]/gi, '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
