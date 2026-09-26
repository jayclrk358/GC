import type { WikiTreeNode } from '@magnox/core';

/** Flatten the page tree into indented options, leaving out `excludeId` and everything under it. */
export function parentOptions(
  nodes: WikiTreeNode[],
  excludeId?: string,
  depth = 0,
): { id: string; title: string; depth: number }[] {
  return nodes.flatMap((n) =>
    n.id === excludeId
      ? []
      : [{ id: n.id, title: n.title, depth }, ...parentOptions(n.children, excludeId, depth + 1)],
  );
}
