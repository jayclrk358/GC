import { describe, expect, it } from 'vitest';
import { formatStamp, formatTime } from '../components/chat/format';
import { formatCount } from './utils';
import { formatDateTime, relativeTime } from './format';
import { dateFormat, numberFormat } from './intl-cache';

describe('cached Intl formatters', () => {
  it('makes each kind once', () => {
    const a = dateFormat('en', { hour: 'numeric', minute: '2-digit', hour12: true });
    expect(dateFormat('en', { hour: 'numeric', minute: '2-digit', hour12: true })).toBe(a);
    // Different options or locale: a different formatter.
    expect(dateFormat('en', { hour: 'numeric', minute: '2-digit', hour12: false })).not.toBe(a);
    expect(dateFormat('de', { hour: 'numeric', minute: '2-digit', hour12: true })).not.toBe(a);
    expect(numberFormat('en', { notation: 'compact' })).toBe(
      numberFormat('en', { notation: 'compact' }),
    );
  });

  it('formats the same as a fresh formatter', () => {
    const at = new Date('2026-03-04T15:04:00Z');
    for (const locale of ['en', 'de', 'ja']) {
      for (const timeFormat of ['auto', '12h', '24h'] as const) {
        const fresh = new Intl.DateTimeFormat(locale, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: timeFormat === 'auto' ? undefined : timeFormat === '12h',
        }).format(at);
        expect(formatTime(at, timeFormat, locale)).toBe(fresh);
        // Twice: the second comes from the cache.
        expect(formatTime(at, timeFormat, locale)).toBe(fresh);
      }
    }
    expect(formatCount(1234, 'en')).toBe('1.2K');
    expect(formatDateTime(at, '24h', 'en')).toBe(
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false,
      }).format(at),
    );
    expect(relativeTime(new Date(Date.now() - 3 * 3600_000), Date.now(), 'en')).toBe('3 hours ago');
  });

  it('still says today and yesterday', () => {
    const labels = {
      today: (t: string) => `Today at ${t}`,
      yesterday: (t: string) => `Yesterday at ${t}`,
    };
    expect(formatStamp(new Date(), '24h', labels, 'en')).toMatch(/^Today at \d{2}:\d{2}$/);
    expect(formatStamp(new Date(Date.now() - 86_400_000), '24h', labels, 'en')).toMatch(
      /^Yesterday at /,
    );
  });
});
