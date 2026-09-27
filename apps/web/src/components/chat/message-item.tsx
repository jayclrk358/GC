'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AtSign,
  CornerUpLeft,
  Flag,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { mentionsMe, type RichNode } from '@magnox/shared';
import { Avatar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RichText } from '@/components/rich-text/rich-text';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { ChatEditor, type ChatEditorHandle } from './chat-editor';
import { Attachments, Embeds } from './attachments';
import { ReactionBar, ReactionPicker } from './reaction-bar';
import { formatTime, fullDateTime } from './format';
import type { ChatMessage } from './types';
import { RoleIcon, StyledName } from '@/components/community/role-decor';
import { UserLink } from '@/components/profile/user-hover-card';

export function authorName(m: ChatMessage): string {
  if (m.kind !== 'user') return 'Magnox';
  return m.author?.nickname || m.author?.name || 'Deleted user';
}

export const MessageItem = React.memo(function MessageItem({
  message: m,
  grouped,
  highlighted,
  tabIndex,
  onFocus,
}: {
  message: ChatMessage;
  grouped: boolean;
  highlighted: boolean;
  tabIndex: number;
  onFocus: (id: string) => void;
}) {
  const t = useTranslations('chat');
  const { me, perms, prefs, blocked, editingId, actions, communityId } = useChat();
  const own = Boolean(me && m.authorId === me.id);
  const pinged = !own && mentionsMe(m, me?.id ?? null, me?.roleIds ?? []);
  const name = authorName(m);
  const time = formatTime(m.createdAt, prefs.timeFormat);
  const editing = editingId === m.id;
  const isBlocked = Boolean(m.authorId && blocked.has(m.authorId));
  const live = !m.pending && !m.failed;
  const [picker, setPicker] = React.useState(false);
  const headerId = `msg-${m.id}-h`;
  // Only the message that holds focus in the log exposes its controls to Tab.
  const ctl = tabIndex === 0 ? 0 : -1;

  return (
    <article
      id={`msg-${m.id}`}
      data-message-id={m.id}
      tabIndex={tabIndex}
      onFocus={(e) => e.target === e.currentTarget && onFocus(m.id)}
      aria-labelledby={headerId}
      className={cn(
        'group relative scroll-mt-16 scroll-mb-16 px-4 outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        grouped ? 'py-0.5' : 'mt-2 pt-1.5 pb-0.5',
        'hover:bg-surface-2/60',
        pinged && 'border-s-2 border-warning bg-warning/10 hover:bg-warning/15',
        highlighted && 'bg-primary/10 ring-2 ring-primary ring-inset',
        m.pending && 'opacity-70',
      )}
    >
      {m.replyTo && (
        <p className="ms-12 mb-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
          <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />
          {m.replyTo.deleted ? (
            <span className="italic">{t('replyDeleted')}</span>
          ) : (
            <button
              type="button"
              onClick={() => actions.jumpTo(m.replyTo!.id)}
              tabIndex={ctl}
              className="min-w-0 truncate text-start hover:text-fg hover:underline"
            >
              <span className="sr-only">{t('replyingToLabel')} </span>
              <span className="font-semibold">@{m.replyTo.authorName}</span> {m.replyTo.excerpt}
            </button>
          )}
        </p>
      )}
      <div className="flex gap-3">
        <div className="w-9 shrink-0 pt-0.5">
          {grouped ? (
            <span
              aria-hidden
              className="invisible block pt-0.5 text-end text-[10px] text-muted tabular-nums group-focus-within:visible group-hover:visible"
            >
              {time}
            </span>
          ) : (
            <Avatar src={m.author?.image} name={name} size={36} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id={headerId}
            className={grouped ? 'sr-only' : 'flex flex-wrap items-baseline gap-x-2 leading-tight'}
          >
            {m.author?.username ? (
              <UserLink
                username={m.author.username}
                communityId={communityId}
                tabIndex={ctl}
                className="hover:underline"
              >
                <StyledName name={name} style={m.author.nameStyle} className="font-semibold" />
              </UserLink>
            ) : (
              <StyledName name={name} style={m.author?.nameStyle} className="font-semibold" />
            )}
            {m.author?.roleName && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                {m.author.roleIcon ? (
                  <RoleIcon url={m.author.roleIcon.url} />
                ) : (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: m.author.roleColor ?? 'var(--c-text-muted)' }}
                  />
                )}
                {m.author.roleName}
              </span>
            )}
            <time
              dateTime={m.createdAt}
              title={fullDateTime(m.createdAt, prefs.timeFormat)}
              className="text-xs text-muted"
            >
              {time}
            </time>
            {pinged && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
                <AtSign className="size-3 text-warning" aria-hidden />
                {t('mentionsYou')}
              </span>
            )}
            {m.pinned && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted">
                <Pin className="size-3" aria-hidden /> {t('pinned')}
              </span>
            )}
          </h3>

          {editing ? (
            <InlineEditor message={m} communityId={communityId} />
          ) : isBlocked ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted">{t('blockedMessage')}</summary>
              <RichText doc={m.body} className="chat-body" />
            </details>
          ) : (
            <div className="min-w-0">
              <RichText doc={m.body} className="chat-body" />
              {m.editedAt && (
                <span
                  className="text-xs text-muted"
                  title={fullDateTime(m.editedAt, prefs.timeFormat)}
                >
                  {' '}
                  {t('edited')}
                </span>
              )}
            </div>
          )}
          {!isBlocked && (
            <>
              <Attachments items={m.attachments} animate={prefs.animatedImages} />
              <Embeds items={m.embeds} />
            </>
          )}
          <ReactionBar
            reactions={m.reactions}
            canReact={perms.react && live}
            controlTabIndex={ctl}
            onToggle={(e) => actions.toggleReaction(m, e)}
          />
          {m.pending && <p className="text-xs text-muted">{t('sending')}</p>}
          {m.failed && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
              {t('failed', { error: m.failed })}
              <Button size="sm" variant="outline" onClick={() => actions.retry(m)}>
                {t('retry')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => actions.discard(m)}>
                {t('discard')}
              </Button>
            </p>
          )}
        </div>
      </div>

      {live && !editing && (
        <div
          className={cn(
            'absolute end-3 -top-3 flex items-center gap-0.5 rounded-ui border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
            picker && 'opacity-100',
          )}
        >
          {perms.react && (
            <ReactionPicker
              open={picker}
              onOpenChange={setPicker}
              onPick={(e) => actions.toggleReaction(m, e)}
              trigger={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('addReactionTo', { name })}
                  tabIndex={ctl}
                >
                  <SmilePlus aria-hidden />
                </Button>
              }
            />
          )}
          {perms.send && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('replyTo', { name })}
              tabIndex={ctl}
              onClick={() => actions.reply(m)}
            >
              <Reply aria-hidden />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('moreFor', { name })}
                tabIndex={ctl}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {own && perms.send && (
                <DropdownMenuItem onSelect={() => actions.startEdit(m)}>
                  <Pencil aria-hidden /> {t('edit')}
                </DropdownMenuItem>
              )}
              {perms.manage && (
                <DropdownMenuItem onSelect={() => actions.pin(m, !m.pinned)}>
                  {m.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}{' '}
                  {m.pinned ? t('unpin') : t('pin')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => actions.copyLink(m)}>
                <Link2 aria-hidden /> {t('copyLink')}
              </DropdownMenuItem>
              {!own && perms.member && (
                <DropdownMenuItem onSelect={() => actions.report(m)}>
                  <Flag aria-hidden /> {t('report')}
                </DropdownMenuItem>
              )}
              {(own || perms.manage) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger" onSelect={() => actions.remove(m)}>
                    <Trash2 aria-hidden /> {t('delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
});

function InlineEditor({ message, communityId }: { message: ChatMessage; communityId: string }) {
  const t = useTranslations('chat');
  const { actions } = useChat();
  const ref = React.useRef<ChatEditorHandle>(null);
  const hintId = `edit-hint-${message.id}`;
  const [saving, setSaving] = React.useState(false);
  async function save(doc: RichNode) {
    setSaving(true);
    const ok = await actions.saveEdit(message, doc);
    setSaving(false);
    if (ok) actions.focusComposer();
  }
  return (
    <div className="mt-1 rounded-ui border border-primary bg-surface">
      <ChatEditor
        ref={ref}
        label={t('editLabel')}
        placeholder=""
        communityId={communityId}
        initial={message.body}
        describedBy={hintId}
        autoFocus
        onSubmit={(doc) => void save(doc)}
        onEscape={() => {
          actions.cancelEdit();
          return true;
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-1">
        <p id={hintId} className="text-xs text-muted">
          {t('editHint')}
        </p>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={actions.cancelEdit}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            loading={saving}
            onClick={() => {
              const doc = ref.current?.getDoc();
              if (doc) void save(doc);
            }}
          >
            {t('save')}
          </Button>
        </span>
      </div>
    </div>
  );
}
