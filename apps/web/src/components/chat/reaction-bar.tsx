'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { SmilePlus } from 'lucide-react';
import { CHAT_REACTIONS, CHAT_REACTION_NAMES } from '@magnox/shared';
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
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 rounded-ui border border-border bg-surface p-1 shadow-xl"
          aria-label={t('pickReaction')}
        >
          <div className="grid grid-cols-8 gap-1">
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
  if (!reactions.length) return null;
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1"
      role="group"
      aria-label={t('reactions')}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact}
          aria-pressed={r.mine}
          tabIndex={controlTabIndex}
          aria-label={t('reactionLabel', { name: nameOf(r.emoji), count: r.count })}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm tabular-nums',
            r.mine ? 'border-primary bg-primary/10' : 'border-border bg-surface',
            canReact && 'hover:border-primary',
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          <span aria-hidden>{r.count}</span>
        </button>
      ))}
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
