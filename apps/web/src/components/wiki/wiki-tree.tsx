'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import type { WikiTreeNode } from '@gamecentral/core';

/** Nested page list. Marks the page being read (or edited) with aria-current. */
export function WikiTree({
  base,
  nodes,
  protectedLabel,
}: {
  base: string;
  nodes: WikiTreeNode[];
  protectedLabel: string;
}) {
  const pathname = usePathname();
  const render = (list: WikiTreeNode[], depth: number) => (
    <ul className={depth ? 'ms-3 border-s border-border ps-2' : 'flex flex-col gap-0.5'}>
      {list.map((n) => {
        const href = `${base}/${n.slug}`;
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={n.id}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className="flex items-center gap-1.5 rounded-ui-sm px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:font-semibold aria-[current=page]:text-fg"
            >
              <span className="min-w-0 truncate">{n.title}</span>
              {n.protected && (
                <Lock className="size-3 shrink-0" role="img" aria-label={protectedLabel} />
              )}
            </Link>
            {n.children.length > 0 && render(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return render(nodes, 0);
}
