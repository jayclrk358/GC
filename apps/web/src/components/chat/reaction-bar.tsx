'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { SmilePlus } from 'lucide-react';
import { CHAT_REACTIONS, CHAT_REACTION_NAMES } from '@magnox/shared';
import { customReaction } from '@magnox/shared/emoji-values';
import { EmojiImage, useCustomEmoji, useReactionInfo } from '@/components/emoji/emoji-context';
import { cn } from '@/lib/utils';

const nameOf = (e: string) => CHAT_REACTION_NAMES[e] ?? e;

/** The emoji grid used by the reaction bar and the message toolbar. */
export function ReactionPicker({
  onPick,
  trigger,
  open,
  onOpenChange,
}: {
  onPick: (emoji: string) => void;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const t = useTranslations('chat');
  const [inner, setInner] = React.useState(false);
  const isOpen = open ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const custom = useCustomEmoji();
  const [filter, setFilter] = React.useState('');
  const shown = filter
    ? custom.filter((e) => e.name.includes(filter.toLowerCase().replace(/:/g, '')))
    : custom;
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="mx-menu z-50 rounded-ui border border-border bg-surface p-1 shadow-xl"
          aria-label={t('pickReaction')}
        >
          <div className="grid grid-cols-8 gap-1" role="group" aria-label={t('standardEmoji')}>
            {CHAT_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(e);
                }}
                aria-label={nameOf(e)}
                className="grid size-9 place-items-center rounded-ui-sm text-lg hover:bg-surface-2"
              >
                <span aria-hidden>{e}</span>
              </button>
            ))}
          </div>
          {custom.length > 0 && (
            <div className="mt-1 border-t border-border pt-1">
              {custom.length > 16 && (
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label={t('findEmoji')}
                  placeholder={t('findEmoji')}
                  className="mb-1 w-full rounded-ui-sm border border-border bg-surface px-2 py-1 text-sm"
                />
              )}
              <div
                className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto"
                role="group"
                aria-label={t('communityEmoji')}
              >
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onPick(customReaction(e.id));
                    }}
                    aria-label={`:${e.name}:`}
                    title={`:${e.name}:`}
                    className="grid size-9 place-items-center rounded-ui-sm hover:bg-surface-2"
                  >
                    <EmojiImage emoji={e} className="size-6 object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ReactionBar({
  reactions,
  canReact,
  onToggle,
  controlTabIndex,
}: {
  reactions: { emoji: string; count: number; mine: boolean }[];
  canReact: boolean;
  onToggle: (emoji: string) => void;
  controlTabIndex?: number;
}) {
  const t = useTranslations('chat');
  const info = useReactionInfo();
  if (!reactions.length) return null;
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1"
      role="group"
      aria-label={t('reactions')}
    >
      {reactions.map((r) => {
        const { name, glyph } = info(r.emoji, nameOf);
        return (
          <button
            key={r.emoji}
            type="button"
            disabled={!canReact}
            aria-pressed={r.mine}
            tabIndex={controlTabIndex}
            aria-label={t('reactionLabel', { name, count: r.count })}
            onClick={() => onToggle(r.emoji)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm tabular-nums',
              r.mine ? 'border-primary bg-primary/10' : 'border-border bg-surface',
              canReact && 'hover:border-primary',
            )}
          >
            {glyph}
            <span aria-hidden>{r.count}</span>
          </button>
        );
      })}
      {canReact && (
        <ReactionPicker
          onPick={onToggle}
          trigger={
            <button
              type="button"
              aria-label={t('addReaction')}
              tabIndex={controlTabIndex}
              className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted hover:border-primary hover:text-fg"
            >
              <SmilePlus className="size-4" aria-hidden />
            </button>
          }
        />
      )}
    </div>
  );
}
