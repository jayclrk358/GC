'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Turnstile, type TurnstileHandle } from '@/components/ui/turnstile';
import { FormError } from '@/components/auth/form-error';
import { voteServerAction } from '@/app/actions/servers';

export interface VotePanelProps {
  serverId: string;
  serverName: string;
  voteCount: number;
  votesThisMonth: number;
  signedIn: boolean;
  emailVerified: boolean;
  /** Pre-formatted wait ("5 h 10 min") when the viewer has already voted today. */
  waitText: string | null;
  rewards: boolean;
  turnstileSiteKey: string | null;
}

export function VotePanel(props: VotePanelProps) {
  const t = useTranslations('serverPage');
  const [count, setCount] = React.useState(props.voteCount);
  const [month, setMonth] = React.useState(props.votesThisMonth);
  const [done, setDone] = React.useState<string | null>(props.waitText);
  const [justVoted, setJustVoted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const turnstile = React.useRef<TurnstileHandle>(null);
  const next = `/servers/${props.serverId}`;

  return (
    <section
      aria-labelledby="vote-h"
      className="flex flex-col gap-4 rounded-ui-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="vote-h" className="flex items-center gap-2 text-lg font-bold uppercase">
          <ThumbsUp className="size-5 text-primary" aria-hidden />
          {t('vote')}
        </h2>
        <dl className="text-end text-sm">
          <div className="flex flex-col-reverse">
            <dt className="text-muted">{t('votesMonth')}</dt>
            <dd className="font-heading text-2xl font-bold">{month}</dd>
          </div>
          <div className="flex justify-end gap-1 text-xs text-muted">
            <dt>{t('votesAll')}</dt>
            <dd>{count}</dd>
          </div>
        </dl>
      </div>
      <p className="text-sm text-muted">{t('voteBody', { name: props.serverName })}</p>

      {!props.signedIn ? (
        <Button asChild>
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>{t('signInToVote')}</Link>
        </Button>
      ) : !props.emailVerified ? (
        <p className="rounded-ui border border-border bg-surface-2 p-3 text-sm">
          {t('verifyToVote')}
        </p>
      ) : done ? (
        <p role="status" className="rounded-ui border border-border bg-surface-2 p-3 text-sm">
          {justVoted ? t('thanks', { wait: done }) : t('votedAlready', { wait: done })}
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            const r = await voteServerAction(props.serverId, {
              username: props.rewards ? username.trim() : undefined,
              turnstileToken: captcha ?? undefined,
            });
            setPending(false);
            if (!r.ok) {
              setError(r.error);
              setFields(r.fields ?? {});
              turnstile.current?.reset();
              return;
            }
            setCount(r.data.voteCount);
            setMonth((m) => m + 1);
            setJustVoted(true);
            setDone(t('day'));
            toast.success(r.data.rewardQueued ? t('votedReward') : t('voted'));
          }}
        >
          <FormError message={error} />
          {props.rewards && (
            <Field label={t('mcName')} description={t('mcNameHint')} error={fields.username}>
              {(p) => (
                <Input
                  {...p}
                  value={username}
                  maxLength={16}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
            </Field>
          )}
          {props.turnstileSiteKey && (
            <Turnstile
              ref={turnstile}
              siteKey={props.turnstileSiteKey}
              action="vote"
              onToken={setCaptcha}
            />
          )}
          <Button type="submit" loading={pending} className="w-full">
            <ThumbsUp aria-hidden /> {t('voteButton')}
          </Button>
        </form>
      )}
    </section>
  );
}
