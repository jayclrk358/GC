import Link from '@/components/ui/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BarChart3, CheckCircle2, Lock, MessageSquare, Pin } from 'lucide-react';
import type { ThreadListItem } from '@gamecentral/core';
import { relativeTime } from '@/lib/format';
import { Avatar, Badge } from '@/components/ui/misc';
import { VoteButtons } from './vote-buttons';
import { FlairBadge } from './flair-badge';
import { UserLink } from '@/components/profile/user-hover-card';
import { StyledName } from '@/components/community/role-decor';

export async function ThreadList({
  communityId,
  slug,
  threads,
  voting,
  qa,
  signedIn,
}: {
  communityId: string;
  slug: string;
  threads: ThreadListItem[];
  voting: boolean;
  qa: boolean;
  signedIn: boolean;
}) {
  const t = await getTranslations('forum');
  const locale = await getLocale();
  return (
    <ol
      className="divide-y divide-border rounded-ui-lg border border-border bg-surface"
      aria-label={t('threads')}
    >
      {threads.map((th) => (
        <li key={th.id} className="flex items-start gap-3 p-4">
          {voting && (
            <VoteButtons
              communityId={communityId}
              threadId={th.id}
              score={th.score}
              myVote={th.myVote}
              title={th.title}
              disabled={!signedIn}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {th.unread && (
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              )}
              <Link
                href={`/c/${slug}/t/${th.id}`}
                prefetch={false}
                className="text-base font-bold hover:underline"
              >
                {th.title}
                {th.unread && <span className="sr-only"> ({t('newActivity')})</span>}
              </Link>
              {th.pinned && (
                <Badge tone="primary">
                  <Pin className="size-3" aria-hidden /> {t('pinned')}
                </Badge>
              )}
              {th.locked && (
                <Badge>
                  <Lock className="size-3" aria-hidden /> {t('locked')}
                </Badge>
              )}
              {qa && th.solved && (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" aria-hidden /> {t('solved')}
                </Badge>
              )}
              {th.hasPoll && (
                <Badge>
                  <BarChart3 className="size-3" aria-hidden /> {t('poll')}
                </Badge>
              )}
              {th.flair && <FlairBadge name={th.flair.name} color={th.flair.color} />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {th.author && (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar src={th.author.image} name={th.author.name} size={18} />
                  {th.author.username ? (
                    <UserLink
                      username={th.author.username}
                      communityId={communityId}
                      className="hover:text-fg hover:underline"
                    >
                      <StyledName name={th.author.name} style={th.author.nameStyle} />
                    </UserLink>
                  ) : (
                    <StyledName name={th.author.name} style={th.author.nameStyle} />
                  )}
                </span>
              )}
              <span aria-hidden>·</span>
              <span>{t('started', { when: relativeTime(th.createdAt, undefined, locale) })}</span>
              <span aria-hidden>·</span>
              <span>
                {t('lastActivity', { when: relativeTime(th.lastActivityAt, undefined, locale) })}
              </span>
            </p>
          </div>
          <p className="flex shrink-0 items-center gap-1 text-sm text-muted tabular-nums">
            <MessageSquare className="size-4" aria-hidden />
            <span className="sr-only">{t('replies', { count: th.replyCount })}</span>
            <span aria-hidden>{th.replyCount}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
