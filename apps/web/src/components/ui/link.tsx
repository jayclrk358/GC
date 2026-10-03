'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';

type Props = React.ComponentProps<typeof NextLink>;

/**
 * next/link, fetching the page ahead when someone is about to open it (the pointer reaches the
 * link, it gets keyboard focus, or a finger goes down on it) rather than whenever it scrolls into
 * view. Every page shows dozens of links (the sidebar, a community's tabs, lists of communities),
 * and fetching each of them ahead cost the server more than the page itself, on every page load,
 * for links that mostly never get opened.
 *
 * `prefetch={true}` still fetches the whole page on sight, and `prefetch={false}` never fetches
 * ahead.
 */
export default function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: Props) {
  const router = useRouter();
  if (prefetch === true || prefetch === false) {
    return (
      <NextLink
        {...props}
        prefetch={prefetch}
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
        onTouchStart={onTouchStart}
      />
    );
  }
  const href = typeof props.href === 'string' ? props.href : null;
  // Only pages on this site (not `//other.site`, `mailto:` or `#here`).
  const warm = () => {
    if (href?.startsWith('/') && !href.startsWith('//')) router.prefetch(href);
  };
  return (
    <NextLink
      {...props}
      prefetch={false}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        warm();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        warm();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        warm();
      }}
    />
  );
}
