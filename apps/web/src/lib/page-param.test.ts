import { describe, expect, it } from 'vitest';
import { MAX_PAGE, pageParam } from './page-param';

describe('pageParam', () => {
  it.each([
    ['3', 3],
    ['0', 0],
    ['2.7', 2],
    [' 4 ', 4],
    ['1e21', MAX_PAGE],
    ['99999999999999999999999', MAX_PAGE],
    ['Infinity', 0],
    ['-5', 0],
    ['abc', 0],
    ['', 0],
    [undefined, 0],
    [null, 0],
    [['2', '3'], 0],
  ])('%j → %d', (value, page) => {
    expect(pageParam(value)).toBe(page);
  });
});
