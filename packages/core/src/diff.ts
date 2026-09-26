import { diffWords } from 'diff';

export interface DiffPart {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** Word-level diff between two plain-text versions. */
export function diffText(before: string, after: string): DiffPart[] {
  return diffWords(before, after).map((p) => ({
    kind: p.added ? 'added' : p.removed ? 'removed' : 'same',
    text: p.value,
  }));
}
