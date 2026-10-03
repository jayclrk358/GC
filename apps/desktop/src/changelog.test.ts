import { describe, expect, it } from 'vitest';
import { parseChangelog } from './changelog';

describe('parseChangelog', () => {
  it('keeps well-formed entries', () => {
    const entries = parseChangelog({
      entries: [{ id: 'a', date: '2026-10-03', title: 'New', items: ['One', 'Two'] }],
    });
    expect(entries).toEqual([{ id: 'a', date: '2026-10-03', title: 'New', items: ['One', 'Two'] }]);
  });

  it('refuses things that are not a changelog', () => {
    expect(parseChangelog(null)).toBeNull();
    expect(parseChangelog('<html>')).toBeNull();
    expect(parseChangelog({ entries: 'nope' })).toBeNull();
  });

  it('drops broken entries and trims long ones', () => {
    const entries = parseChangelog({
      entries: [
        { id: 'a', date: 'yesterday', title: 'Bad date', items: [] },
        { id: '', date: '2026-10-03', title: 'No id', items: [] },
        { id: 'b', date: '2026-10-03', title: 'x'.repeat(500), items: [1, 'ok', { a: 1 }] },
        ...Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, date: '2026-10-01', title: 'T' })),
      ],
    });
    expect(entries?.[0]).toEqual({
      id: 'b',
      date: '2026-10-03',
      title: 'x'.repeat(200),
      items: ['ok'],
    });
    // At most 10 looked at.
    expect(entries).toHaveLength(8);
  });
});
