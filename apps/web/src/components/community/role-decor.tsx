import type * as React from 'react';
import type { NameStyleView } from '@magnox/shared';
import { cn } from '@/lib/utils';

/**
 * A member's name with their role's nametag effect. The effect's colours come already made
 * readable for light and dark backgrounds; high contrast mode and the "name effects" preference
 * show the plain name instead.
 */

export function StyledName({
  name,
  style,
  scheme,
  className,
}: {
  name: string;
  style: NameStyleView | null | undefined;
  /** Force light or dark colours (previews); normally the page's scheme decides. */
  scheme?: 'light' | 'dark';
  className?: string;
}) {
  if (!style) return <span className={className}>{name}</span>;
  return (
    <span
      className={cn('mx-name', className)}
      data-effect={style.effect}
      data-anim={style.animation === 'none' ? undefined : style.animation}
      style={
        {
          '--mx-n1l': style.light[0],
          '--mx-n2l': style.light[1],
          '--mx-n1d': style.dark[0],
          '--mx-n2d': style.dark[1],
          ...(style.rainbow
            ? { '--mx-rbl': style.rainbow.light, '--mx-rbd': style.rainbow.dark }
            : {}),
          ...(scheme
            ? {
                '--mx-n1': style[scheme][0],
                '--mx-n2': style[scheme][1],
                ...(style.rainbow ? { '--mx-rainbow': style.rainbow[scheme] } : {}),
              }
            : {}),
        } as React.CSSProperties
      }
    >
      {name}
    </span>
  );
}

/**
 * A role's icon image, sized to the text beside it. Pass the role name as `alt` where the icon is
 * the only sign of the role; leave it empty where the role name is written out next to it.
 */
export function RoleIcon({
  url,
  alt = '',
  className,
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      title={alt || undefined}
      loading="lazy"
      decoding="async"
      className={cn('inline-block size-[1.15em] shrink-0 object-contain align-[-0.2em]', className)}
    />
  );
}
