import { describe, expect, it } from 'vitest';
import { allowanceLeft, capRecipients } from './services/notify';

describe('capRecipients', () => {
  it('keeps people mentioned by name or replied to first', () => {
    const direct = new Set(['d1', 'd2']);
    expect(capRecipients(['r1', 'd1', 'r2', 'd2', 'r3'], direct, 3)).toEqual(['d1', 'd2', 'r1']);
  });
  it('keeps everyone under the cap, in order', () => {
    expect(capRecipients(['a', 'b'], new Set(['b']), 10)).toEqual(['b', 'a']);
    expect(capRecipients(['a', 'b'], new Set(), 0)).toEqual([]);
  });
});

describe('allowanceLeft', () => {
  it('lets through what fits under the hourly cap', () => {
    expect(allowanceLeft(0, 50, 100)).toBe(50);
    expect(allowanceLeft(80, 50, 100)).toBe(20);
    expect(allowanceLeft(100, 50, 100)).toBe(0);
    expect(allowanceLeft(150, 50, 100)).toBe(0);
  });
});
