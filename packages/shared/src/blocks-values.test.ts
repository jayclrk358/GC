import { describe, expect, it } from 'vitest';
import { blockConfigSchemas } from './blocks';
import { BLOCK_TYPES } from './blocks-values';

describe('block values', () => {
  it('lists every block type in the schemas, in the same order', () => {
    expect(BLOCK_TYPES).toEqual(Object.keys(blockConfigSchemas));
  });
});
