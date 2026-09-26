import { describe, expect, it } from 'vitest';
import { diffText } from './diff';

describe('diffText', () => {
  it('marks added and removed words and keeps the rest', () => {
    const parts = diffText(
      'Download the modpack from the website.',
      'Download the modpack from the launcher.',
    );
    expect(parts.filter((p) => p.kind === 'removed').map((p) => p.text.trim())).toEqual([
      'website',
    ]);
    expect(parts.filter((p) => p.kind === 'added').map((p) => p.text.trim())).toEqual(['launcher']);
    expect(parts.map((p) => (p.kind === 'removed' ? '' : p.text)).join('')).toBe(
      'Download the modpack from the launcher.',
    );
  });

  it('treats a first version as all added', () => {
    expect(diffText('', 'Hello world')).toEqual([{ kind: 'added', text: 'Hello world' }]);
  });

  it('returns a single unchanged part when nothing changed', () => {
    expect(diffText('Same text', 'Same text')).toEqual([{ kind: 'same', text: 'Same text' }]);
  });
});
