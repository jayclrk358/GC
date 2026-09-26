import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, CornerDownRight, Lock, Pin } from 'lucide-react';
import {
  getThread,
  isAppError,
  listFlairs,
  listPosts,
  listVisibleChannels,
  pollResults,
  type PostView,
} from '@magnox/core';
import { has, Permission } from '@magnox/shared';
import { loadCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Alert, Avatar, Badge } from '@/components/ui/misc';
import { RichText } from '@/components/rich-text/rich-text';
import { JoinButton } from '@/components/community/join-button';
import { RoleBadge } from '@/components/community/role-badge';
import { FlairBadge } from '@/components/forum/flair-badge';
import { VoteButtons } from '@/components/forum/vote-buttons';
import { PollCard } from '@/components/forum/poll-card';
import { Reactions } from '@/components/forum/reactions';
import { PostActions } from '@/components/forum/post-actions';
import { ReplyComposer } from '@/components/forum/reply-composer';
import { ThreadProvider } from '@/components/forum/thread-context';
import { ThreadLiveBanner } from '@/components/forum/live-banners';
import { FollowButton, ModTools, ReadMarker } from '@/components/forum/thread-tools';

type Params = Promise<{ slug: string; threadId: string }>;

async function load(slug: string, threadId: string) {
  const data = await loadCommunity(slug);
  try {
    return { data, ...(await getThread(data.ctx, threadId)) };
  } catch (e) {
    if (isAppError(e) && (e.code === 'not_found' || e.code === 'forbidden')) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, threadId } = await params;
  const { thread } = await load(slug, threadId);
  return { title: thread.title };
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug, threadId } = await params;
  const { data, thread, channel, flair, poll, myVote, following } = await load(slug, threadId);
  const t = await getTranslations('forum');
  const perms = BigInt(channel.perms);
  const userId = data.user?.id ?? null;
  const isMod = has(perms, Permission.MANAGE_THREADS);
  const canModerateMessages = isMod || has(perms, Permission.MANAGE_MESSAGES);
  const isAuthor = Boolean(userId && thread.authorId === userId);
  const member = data.ctx.isMember;

  const pageSize = 30;
  const lastPage = Math.max(0, Math.ceil((thread.replyCount + 1) / pageSize) - 1);
  const requested = Number((await searchParams).page ?? 0) || 0;
  const page = Math.min(Math.max(0, requested), lastPage);
  const [{ posts, total }, results, flairs, forums, prefs] = await Promise.all([
    listPosts(data.ctx, thread.id, { page, pageSize }),
    poll ? pollResults(data.ctx, poll.id) : null,
    isMod || isAuthor ? listFlairs(data.community.id, channel.id) : [],
    isMod ? listVisibleChannels(data.ctx, { types: ['forum', 'announcement'] }) : null,
    getPrefs(),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const byId = new Map(posts.map((p) => [p.id, p]));
  const lastPostId = posts.at(-1)?.id ?? null;

  const canReply = member && has(perms, Permission.REPLY_IN_THREADS) && (!thread.locked || isMod);
  const canReact = member && has(perms, Permission.ADD_REACTIONS);
  const voting = Boolean(channel.settings.voting);
  const qa = Boolean(channel.settings.qa);
  const authorName = (p: PostView) => p.author.nickname || p.author.name;
  const base = `/c/${slug}`;
  const pageHref = (n: number) =>
    n === 0 ? `${base}/t/${thread.id}` : `${base}/t/${thread.id}?page=${n}`;

  return (
    <ThreadProvider>
      <article
        aria-labelledby="thread-title"
        className="mx-auto flex w-full max-w-4xl flex-col gap-5"
      >
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
          <Link href={`${base}/forum`} className="hover:underline">
            {t('title')}
          </Link>{' '}
          ›{' '}
          <Link href={`${base}/forum/${channel.name}`} className="hover:underline">
            {channel.name}
          </Link>
        </nav>

        <header className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {voting && (
              <VoteButtons
                communityId={data.community.id}
                threadId={thread.id}
                score={thread.score}
                myVote={myVote}
                title={thread.title}
                disabled={!member || !has(perms, Permission.VOTE)}
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 id="thread-title" className="text-2xl font-bold break-words">
                {thread.title}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {flair && <FlairBadge name={flair.name} color={flair.color} />}
                {thread.pinned && (
                  <Badge tone="primary">
                    <Pin className="size-3" aria-hidden /> {t('pinned')}
                  </Badge>
                )}
                {thread.locked && (
                  <Badge tone="warning">
                    <Lock className="size-3" aria-hidden /> {t('locked')}
                  </Badge>
                )}
                {qa && thread.solutionPostId && (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" aria-hidden /> {t('solved')}
                  </Badge>
                )}
                <span className="text-muted">{t('replies', { count: thread.replyCount })}</span>
              </p>
            </div>
          </div>
          {userId && (
            <div className="flex flex-wrap gap-2">
              {member && (
                <FollowButton
                  communityId={data.community.id}
                  threadId={thread.id}
                  following={following}
                />
              )}
              {(isMod || isAuthor) && (
                <ModTools
                  communityId={data.community.id}
                  threadId={thread.id}
                  pinned={thread.pinned}
                  locked={thread.locked}
                  channelId={channel.id}
                  flairId={thread.flairId}
                  channels={forums?.channels.map((c) => ({ id: c.id, name: c.name })) ?? []}
                  flairs={flairs
                    .filter((f) => isMod || !f.modOnly)
                    .map((f) => ({ id: f.id, name: f.name }))}
                  isMod={isMod}
                />
              )}
            </div>
          )}
        </header>

        {results && (
          <PollCard
            communityId={data.community.id}
            initial={results}
            canVote={member && has(perms, Permission.VOTE)}
          />
        )}

        <ThreadLiveBanner threadId={thread.id} userId={userId} />

        {pages > 1 && (
          <Pager
            label={t('pagination')}
            page={page}
            pages={pages}
            href={pageHref}
            pageLabel={(n) => t('pageN', { n })}
          />
        )}

        <ol className="flex flex-col gap-4" aria-label={t('posts')}>
          {posts.map((p) => {
            const isSolution = qa && thread.solutionPostId === p.id;
            const parent = p.replyToId ? byId.get(p.replyToId) : null;
            const own = Boolean(userId && p.author.id === userId);
            return (
              <li key={p.id}>
                <article
                  id={`post-${p.id}`}
                  aria-labelledby={`post-${p.id}-author`}
                  className={
                    isSolution
                      ? 'scroll-mt-24 rounded-ui-lg border-2 border-success bg-surface p-4'
                      : 'scroll-mt-24 rounded-ui-lg border border-border bg-surface p-4 target:ring-2 target:ring-primary'
                  }
                >
                  <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Avatar src={p.author.image} name={authorName(p)} size={36} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        {p.author.username ? (
                          <Link
                            id={`post-${p.id}-author`}
                            href={`/u/${p.author.username}`}
                            className="font-semibold hover:underline"
                          >
                            {authorName(p)}
                          </Link>
                        ) : (
                          <span id={`post-${p.id}-author`} className="font-semibold">
                            {authorName(p)}
                          </span>
                        )}
                        {p.author.roleName && (
                          <RoleBadge
                            name={p.author.roleName}
                            color={p.author.roleColor}
                            colorblind={prefs.colorblindRoleColors}
                          />
                        )}
                        {p.isOp && <Badge tone="primary">{t('op')}</Badge>}
                        {isSolution && (
                          <Badge tone="success">
                            <CheckCircle2 className="size-3" aria-hidden /> {t('acceptedAnswer')}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        <time
                          dateTime={p.createdAt.toISOString()}
                          title={formatDateTime(p.createdAt)}
                        >
                          {relativeTime(p.createdAt)}
                        </time>
                        {p.editedAt && (
                          <>
                            {' · '}
                            <span title={formatDateTime(p.editedAt)}>{t('edited')}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </header>

                  {p.replyToId && (
                    <p className="mb-2 flex items-center gap-1 text-sm text-muted">
                      <CornerDownRight className="size-4" aria-hidden />
                      <a
                        href={
                          parent
                            ? `#post-${p.replyToId}`
                            : `${base}/t/${thread.id}/p/${p.replyToId}`
                        }
                        className="hover:underline"
                      >
                        {parent
                          ? t('inReplyTo', { name: authorName(parent) })
                          : t('inReplyToEarlier')}
                      </a>
                    </p>
                  )}

                  {p.deleted ? (
                    <p className="text-muted italic">{t('postDeleted')}</p>
                  ) : p.blocked ? (
                    <details>
                      <summary className="cursor-pointer text-sm text-muted">
                        {t('blockedPost')}
                      </summary>
                      <RichText doc={p.body} className="mt-2" headingOffset={2} />
                    </details>
                  ) : (
                    <RichText doc={p.body} headingOffset={2} />
                  )}

                  {!p.deleted && (
                    <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <Reactions
                        communityId={data.community.id}
                        postId={p.id}
                        initial={p.reactions}
                        canReact={canReact}
                      />
                      {userId && (
                        <PostActions
                          communityId={data.community.id}
                          slug={slug}
                          channelName={channel.name}
                          threadId={thread.id}
                          threadTitle={thread.title}
                          post={{
                            id: p.id,
                            isOp: p.isOp,
                            body: p.body,
                            authorName: authorName(p),
                            edited: Boolean(p.editedAt),
                            isSolution,
                          }}
                          can={{
                            reply: canReply,
                            edit: own && !thread.locked,
                            delete: own || canModerateMessages,
                            report: member && !own,
                            solve: qa && !p.isOp && (isAuthor || isMod),
                          }}
                        />
                      )}
                    </footer>
                  )}
                </article>
              </li>
            );
          })}
        </ol>

        {pages > 1 && (
          <Pager
            label={t('paginationBottom')}
            page={page}
            pages={pages}
            href={pageHref}
            pageLabel={(n) => t('pageN', { n })}
          />
        )}

        {canReply ? (
          <ReplyComposer
            communityId={data.community.id}
            threadId={thread.id}
            lastPage={Math.max(0, Math.ceil((total + 1) / pageSize) - 1)}
            slug={slug}
            requireAlt={Boolean(data.community.settings.requireAltText)}
          />
        ) : thread.locked ? (
          <Alert tone="warning" title={t('lockedTitle')}>
            {t('lockedBody')}
          </Alert>
        ) : !userId ? (
          <Alert tone="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {t('signInToReply')}
              <Button asChild size="sm">
                <Link href={`/sign-in?next=${encodeURIComponent(`${base}/t/${thread.id}`)}`}>
                  {t('signIn')}
                </Link>
              </Button>
            </span>
          </Alert>
        ) : !member ? (
          <Alert tone="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {t('joinToReply')}
              <JoinButton
                communityId={data.community.id}
                signedIn
                isMember={false}
                isOwner={false}
                joinMode={data.community.joinMode}
                visibility={data.community.visibility}
              />
            </span>
          </Alert>
        ) : null}

        {/* Only the last page means "caught up". */}
        {userId && page === pages - 1 && (
          <ReadMarker threadId={thread.id} lastPostId={thread.lastPostId ?? lastPostId} />
        )}
      </article>
    </ThreadProvider>
  );
}

function Pager({
  label,
  page,
  pages,
  href,
  pageLabel,
}: {
  label: string;
  page: number;
  pages: number;
  href: (n: number) => string;
  pageLabel: (n: number) => string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-1">
        {Array.from({ length: pages }, (_, i) => (
          <li key={i}>
            <Link
              href={href(i)}
              aria-current={i === page ? 'page' : undefined}
              aria-label={pageLabel(i + 1)}
              className="grid min-h-9 min-w-9 place-items-center rounded-ui-sm border border-border px-2 text-sm font-semibold aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-on-primary"
            >
              {i + 1}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
