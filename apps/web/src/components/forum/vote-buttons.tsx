'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { voteThreadAction } from '@/app/actions/forum';
import { cn } from '@/lib/utils';

export function VoteButtons({
  communityId,
  threadId,
  score: initialScore,
  myVote: initialVote,
  title,
  disabled,
  orientation = 'vertical',
}: {
  communityId: string;
  threadId: string;
  score: number;
  myVote: number;
  title: string;
  disabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
}) {
  const t = useTranslations('forum');
  const [score, setScore] = React.useState(initialScore);
  const [vote, setVote] = React.useState(initialVote);

  async function cast(value: 1 | -1) {
    const next = vote === value ? 0 : value;
    const prev = { score, vote };
    setVote(next);
    setScore(score - vote + next);
    const r = await voteThreadAction(communityId, threadId, next);
    if (r.ok) setScore(r.data.score);
    else {
      setVote(prev.vote);
      setScore(prev.score);
      toast.error(r.error);
    }
  }

  return (
    <div
      role="group"
      aria-label={t('votesFor', { title })}
      className={cn('flex items-center gap-0.5', orientation === 'vertical' ? 'flex-col' : 'flex-row')}
    >
      <button
        type="button"
        onClick={() => void cast(1)}
        disabled={disabled}
        aria-pressed={vote === 1}
        aria-label={t('upvote')}
        className="rounded-ui-sm p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 aria-pressed:text-primary"
      >
        <ArrowBigUp className={cn('size-5', vote === 1 && 'fill-current')} aria-hidden />
      </button>
      <span className="min-w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">
        <span className="sr-only">{t('score')} </span>
        {score}
      </span>
      <button
        type="button"
        onClick={() => void cast(-1)}
        disabled={disabled}
        aria-pressed={vote === -1}
        aria-label={t('downvote')}
        className="rounded-ui-sm p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 aria-pressed:text-danger"
      >
        <ArrowBigDown className={cn('size-5', vote === -1 && 'fill-current')} aria-hidden />
      </button>
    </div>
  );
}
