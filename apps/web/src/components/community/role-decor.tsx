import type * as React from 'react';
import { LETTER_ANIMATIONS, type NameStyleView } from '@gamecentral/shared';
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
  const letters = LETTER_ANIMATIONS.has(style.animation);
  return (
    <span
      className={cn('mx-name', className)}
      data-effect={style.effect}
      data-palette={style.palette ? '' : undefined}
      data-anim={style.animation === 'none' ? undefined : style.animation}
      style={
        {
          '--mx-n1l': style.light[0],
          '--mx-n2l': style.light[1],
          '--mx-n1d': style.dark[0],
          '--mx-n2d': style.dark[1],
          ...(style.palette
            ? { '--mx-pl': style.palette.light, '--mx-pd': style.palette.dark }
            : {}),
          ...(scheme
            ? {
                '--mx-n1': style[scheme][0],
                '--mx-n2': style[scheme][1],
                ...(style.palette ? { '--mx-palette': style.palette[scheme] } : {}),
              }
            : {}),
        } as React.CSSProperties
      }
    >
      {letters ? (
        <>
          {/* Screen readers get the name once; the moving letters are for show. */}
          <span className="sr-only">{name}</span>
          <span aria-hidden>
            {Array.from(name).map((ch, i) => (
              <span key={i} className="mx-name-letter" style={{ '--i': i } as React.CSSProperties}>
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            ))}
          </span>
        </>
      ) : (
        name
      )}
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
