'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import type { HeldPostView } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/misc';
import { reviewHeldPostAction } from '@/app/actions/automod';
import { formatDateTime, relativeTime } from '@/lib/format';

/** Posts automod held back: let them through or turn them away. */
export function HeldQueue({ communityId, items }: { communityId: string; items: HeldPostView[] }) {
  const t = useTranslations('modQueue');
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function decide(item: HeldPostView, decision: 'approve' | 'reject') {
    setBusy(`${item.id}:${decision}`);
    const r = await reviewHeldPostAction(communityId, item.id, decision);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      decision === 'approve'
        ? t('approvedToast', { name: item.author.name })
        : t('rejectedToast', { name: item.author.name }),
    );
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const where =
          item.kind === 'reply' && item.thread
            ? t('inThread', { title: item.thread.title })
            : item.channel.type === 'text' || item.channel.type === 'announcement'
              ? t('inChannel', { name: item.channel.name })
              : t('inForum', { name: item.channel.name });
        return (
          <li key={item.id}>
            <article
              aria-labelledby={`held-${item.id}`}
              className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4"
            >
              <header className="flex flex-wrap items-center gap-3">
                <Avatar src={item.author.image} name={item.author.name} size={36} />
                <div className="min-w-0 flex-1">
                  <h3 id={`held-${item.id}`} className="font-bold">
                    {item.author.username ? (
                      <Link href={`/u/${item.author.username}`} className="hover:underline">
                        {item.author.name}
                      </Link>
                    ) : (
                      item.author.name
                    )}
                  </h3>
                  <p className="text-sm text-muted" suppressHydrationWarning>
                    {t(`kinds.${item.kind}`)} · {where} ·{' '}
                    <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                      {relativeTime(item.createdAt)}
                    </time>
                  </p>
                </div>
                <Badge>
                  {t(`rules.${item.rule}`)}
                  {item.match ? `: ${item.match}` : ''}
                </Badge>
              </header>
              {item.title && <p className="font-semibold">{item.title}</p>}
              <blockquote className="rounded-ui border-s-4 border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">
                <span className="sr-only">{t('content')}: </span>
                {item.text || t('noText')}
              </blockquote>
              {item.status === 'pending' ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    loading={busy === `${item.id}:reject`}
                    disabled={busy !== null}
                    aria-label={t('rejectFor', { name: item.author.name })}
                    onClick={() => void decide(item, 'reject')}
                  >
                    <X aria-hidden /> {t('reject')}
                  </Button>
                  <Button
                    loading={busy === `${item.id}:approve`}
                    disabled={busy !== null}
                    aria-label={t('approveFor', { name: item.author.name })}
                    onClick={() => void decide(item, 'approve')}
                  >
                    <Check aria-hidden /> {t('approve')}
                  </Button>
                </div>
              ) : (
                <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  <span suppressHydrationWarning>
                    {t(item.status === 'approved' ? 'approvedBy' : 'rejectedBy', {
                      name: item.reviewerName ?? t('someone'),
                      when: item.reviewedAt ? formatDateTime(item.reviewedAt) : '',
                    })}
                  </span>
                  {item.resultUrl && (
                    <Link
                      href={item.resultUrl}
                      className="font-semibold text-primary hover:underline"
                    >
                      {t('view')}
                    </Link>
                  )}
                </p>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
