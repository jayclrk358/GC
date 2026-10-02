'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { customReactionId, type CustomEmoji } from '@magnox/shared/emoji-values';

/** The community's custom emoji, for reactions (pickers and the reactions on messages). */
const EmojiContext = React.createContext<CustomEmoji[]>([]);

/**
 * The mounted EmojiProvider's list, for code outside React: the editor's ":" suggestions use it
 * instead of asking the server again. Null when no provider is mounted.
 */
let pageEmoji: CustomEmoji[] | null = null;

export function providedEmoji(): CustomEmoji[] | null {
  return pageEmoji;
}

export function EmojiProvider({
  emoji,
  children,
}: {
  emoji: CustomEmoji[];
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    pageEmoji = emoji;
    return () => {
      if (pageEmoji === emoji) pageEmoji = null;
    };
  }, [emoji]);
  return <EmojiContext.Provider value={emoji}>{children}</EmojiContext.Provider>;
}

export function useCustomEmoji(): CustomEmoji[] {
  return React.useContext(EmojiContext);
}

/** A custom emoji's picture, sized to the text around it. Decorative unless given a label. */
export function EmojiImage({
  emoji,
  label,
  className,
}: {
  emoji: Pick<CustomEmoji, 'name' | 'url'>;
  /** Alt text; leave out where the name is given some other way. */
  label?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny images, served as uploaded
    <img
      src={emoji.url}
      alt={label ?? ''}
      draggable={false}
      loading="lazy"
      className={className ?? 'mx-emoji'}
    />
  );
}

/** How a reaction looks and is named: a Unicode emoji, or one of the community's own. */
export function useReactionInfo() {
  const custom = useCustomEmoji();
  const t = useTranslations('chat');
  return React.useCallback(
    (reaction: string, unicodeName: (e: string) => string) => {
      const id = customReactionId(reaction);
      if (!id) return { name: unicodeName(reaction), glyph: <span aria-hidden>{reaction}</span> };
      const e = custom.find((x) => x.id === id);
      if (!e) return { name: t('deletedEmoji'), glyph: <span aria-hidden>❔</span> };
      return {
        name: `:${e.name}:`,
        glyph: <EmojiImage emoji={e} className="mx-emoji size-[1.15em]" />,
      };
    },
    [custom, t],
  );
}
