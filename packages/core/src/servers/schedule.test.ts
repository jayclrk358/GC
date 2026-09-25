import { describe, expect, it } from 'vitest';
import { cleanServerText, nextPollDelay, POLL, shouldGoDormant } from './schedule';

describe('poll scheduling', () => {
  it('polls hot and important servers every minute', () => {
    expect(nextPollDelay({ ok: true, failCount: 0, hot: true, important: false })).toBe(POLL.hotMs);
    expect(nextPollDelay({ ok: true, failCount: 0, hot: false, important: true })).toBe(POLL.hotMs);
  });

  it('polls everything else every five minutes', () => {
    expect(nextPollDelay({ ok: true, failCount: 0, hot: false, important: false })).toBe(POLL.normalMs);
  });

  it('backs off exponentially on failure and caps at an hour', () => {
    const s = { ok: false, hot: false, important: true };
    expect(nextPollDelay({ ...s, failCount: 1 })).toBe(60_000);
    expect(nextPollDelay({ ...s, failCount: 2 })).toBe(120_000);
    expect(nextPollDelay({ ...s, failCount: 3 })).toBe(240_000);
    expect(nextPollDelay({ ...s, failCount: 20 })).toBe(POLL.maxBackoffMs);
  });

  it('applies at most ±10% jitter', () => {
    const s = { ok: true, failCount: 0, hot: true, important: false };
    expect(nextPollDelay(s, 1)).toBe(66_000);
    expect(nextPollDelay(s, -1)).toBe(54_000);
    expect(nextPollDelay(s, 5)).toBe(66_000);
  });

  it('goes dormant after a week offline', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    expect(shouldGoDormant({ lastOnlineAt: new Date('2026-01-02T00:00:00Z'), createdAt: new Date(0), now })).toBe(true);
    expect(shouldGoDormant({ lastOnlineAt: new Date('2026-01-05T00:00:00Z'), createdAt: new Date(0), now })).toBe(false);
    expect(shouldGoDormant({ lastOnlineAt: null, createdAt: new Date('2026-01-09T00:00:00Z'), now })).toBe(false);
  });

  it('cleans server-reported text', () => {
    expect(cleanServerText('§aWelcome §lto §rCraft\n\u0007Land')).toBe('Welcome to Craft Land');
    expect(cleanServerText(42)).toBeNull();
    expect(cleanServerText('   ')).toBeNull();
    expect(cleanServerText('x'.repeat(500))?.length).toBe(200);
  });
});
