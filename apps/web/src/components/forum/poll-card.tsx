'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PollResults } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { votePollAction } from '@/app/actions/forum';

export function PollCard({ communityId, initial, canVote }: { communityId: string; initial: PollResults; canVote: boolean }) {
  const t = useTranslations('forum');
  const [poll, setPoll] = React.useState(initial);
  const voted = poll.options.some((o) => o.mine);
  const [choosing, setChoosing] = React.useState(!voted && canVote && !poll.closed);
  const [selected, setSelected] = React.useState<string[]>(poll.options.filter((o) => o.mine).map((o) => o.id));
  const [pending, setPending] = React.useState(false);
  const total = poll.options.reduce((a, o) => a + o.votes, 0);

  async function submit() {
    setPending(true);
    const r = await votePollAction(communityId, poll.id, selected);
    setPending(false);
    if (r.ok) {
      setPoll(r.data);
      setChoosing(false);
    } else toast.error(r.error);
  }

  return (
    <section aria-labelledby={`poll-${poll.id}`} className="rounded-ui-lg border border-border bg-surface p-4">
      <h3 id={`poll-${poll.id}`} className="font-bold">
        {poll.question}
      </h3>
      <p className="text-sm text-muted">
        {poll.multiple ? t('pollPickMany') : t('pollPickOne')} · {t('voters', { count: poll.totalVoters })}
        {poll.closed ? ` · ${t('pollClosed')}` : poll.closesAt ? ` · ${t('pollClosesAt', { date: new Date(poll.closesAt).toLocaleString() })}` : ''}
      </p>
      {choosing ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{poll.question}</legend>
            {poll.options.map((o) => (
              <label key={o.id} className="flex items-center gap-3 rounded-ui border border-border px-3 py-2 has-[:checked]:border-primary">
                <input
                  type={poll.multiple ? 'checkbox' : 'radio'}
                  name={`poll-${poll.id}`}
                  value={o.id}
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    setSelected(
                      poll.multiple
                        ? e.target.checked
                          ? [...selected, o.id]
                          : selected.filter((x) => x !== o.id)
                        : [o.id],
                    )
                  }
                  className="size-4 accent-[var(--c-primary)]"
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={pending} disabled={!selected.length}>
              {t('vote')}
            </Button>
            {voted && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setChoosing(false)}>
                {t('cancel')}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {poll.options.map((o) => {
              const pct = total ? Math.round((o.votes / total) * 100) : 0;
              return (
                <li key={o.id}>
                  <p className="flex justify-between text-sm">
                    <span className="font-medium">
                      {o.label}
                      {o.mine && <span className="text-primary"> ({t('yourVote')})</span>}
                    </span>
                    <span className="tabular-nums">
                      {pct}% · {t('votes', { count: o.votes })}
                    </span>
                  </p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {canVote && !poll.closed && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setChoosing(true)}>
              {voted ? t('changeVote') : t('vote')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
