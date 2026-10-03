'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { SmilePlus } from 'lucide-react';
import { Popover } from 'radix-ui';
import { REACTION_NAMES, REACTIONS } from '@gamecentral/shared';
import { toggleReactionAction } from '@/app/actions/forum';
import { cn } from '@/lib/utils';

type Reaction = { emoji: string; count: number; mine: boolean };

export function Reactions({
  communityId,
  postId,
  initial,
  canReact,
}: {
  communityId: string;
  postId: string;
  initial: Reaction[];
  canReact: boolean;
}) {
  const t = useTranslations('forum');
  const [reactions, setReactions] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setReactions(initial);
  }
  const [open, setOpen] = React.useState(false);

  async function toggle(emoji: string) {
    const prev = reactions;
    const existing = reactions.find((r) => r.emoji === emoji);
    const next = existing
      ? reactions
          .map((r) =>
            r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r,
          )
          .filter((r) => r.count > 0)
      : [...reactions, { emoji, count: 1, mine: true }];
    setReactions(next);
    const r = await toggleReactionAction(communityId, postId, emoji);
    if (!r.ok) {
      setReactions(prev);
      toast.error(r.error);
    }
  }

  const name = (e: string) => REACTION_NAMES[e as keyof typeof REACTION_NAMES] ?? e;

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('reactions')}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact}
          aria-pressed={r.mine}
          aria-label={t('reactionLabel', { name: name(r.emoji), count: r.count })}
          onClick={() => void toggle(r.emoji)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm tabular-nums',
            r.mine ? 'border-primary bg-primary/10' : 'border-border bg-surface-2',
            canReact && 'hover:border-primary',
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          <span aria-hidden>{r.count}</span>
        </button>
      ))}
      {canReact && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={t('addReaction')}
              className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted hover:border-primary hover:text-fg"
            >
              <SmilePlus className="size-4" aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              className="mx-menu z-50 rounded-ui border border-border bg-surface p-1 shadow-xl"
              aria-label={t('pickReaction')}
            >
              <div className="grid grid-cols-4 gap-1">
                {REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void toggle(e);
                    }}
                    aria-label={name(e)}
                    className="grid size-9 place-items-center rounded-ui-sm text-lg hover:bg-surface-2"
                  >
                    <span aria-hidden>{e}</span>
                  </button>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
