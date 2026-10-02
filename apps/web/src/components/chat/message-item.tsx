'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AtSign,
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
import { ChatEditor, type ChatEditorHandle } from './lazy-chat-editor';
import { Attachments, Embeds } from './attachments';
import { ReactionBar, ReactionPicker } from './reaction-bar';
import { formatStamp, formatTime, fullDateTime } from './format';
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
  const locale = useLocale();
  const { me, perms, prefs, blocked, editingId, actions, communityId } = useChat();
  const own = Boolean(me && m.authorId === me.id);
  const pinged = !own && mentionsMe(m, me?.id ?? null, me?.roleIds ?? []);
  const name = authorName(m);
  const time = formatTime(m.createdAt, prefs.timeFormat, locale);
  const editing = editingId === m.id;
  const isBlocked = Boolean(m.authorId && blocked.has(m.authorId));
  const live = !m.pending && !m.failed;
  const [picker, setPicker] = React.useState(false);
  const headerId = `msg-${m.id}-h`;
  // A grouped message's heading is only there for screen readers, so its name isn't styled
  // (an animated name nobody can see would still cost a repaint every frame).
  const nameStyle = grouped ? undefined : m.author?.nameStyle;
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
        grouped ? 'py-0.5' : 'mt-3.5 pt-0.5 pb-0.5',
        'hover:bg-fg/[0.035]',
        pinged && 'border-s-2 border-warning bg-warning/10 hover:bg-warning/15',
        highlighted && 'bg-primary/10 ring-2 ring-primary ring-inset',
        m.pending && 'opacity-70',
      )}
    >
      {m.replyTo && (
        <p className="relative ms-14 mb-0.5 flex min-w-0 items-center gap-1 text-[0.8125rem] text-muted">
          {/* Discord's reply line, from the avatar up to what's being answered. */}
          <span
            aria-hidden
            className="absolute -start-9 top-1/2 h-[0.65rem] w-8 rounded-ss-md border-s-2 border-t-2 border-border"
          />
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
              <span className="font-semibold">
                @<StyledName name={m.replyTo.authorName} style={m.replyTo.authorStyle} />
              </span>{' '}
              {m.replyTo.excerpt}
            </button>
          )}
        </p>
      )}
      <div className="flex gap-4">
        <div className="w-10 shrink-0 pt-0.5">
          {grouped ? (
            <span
              aria-hidden
              className="invisible block pt-1 text-end text-[10px] text-muted tabular-nums group-focus-within:visible group-hover:visible"
            >
              {time}
            </span>
          ) : (
            <Avatar
              src={m.author?.image}
              name={name}
              size={40}
              presence={m.authorId}
              presenceLabelled={false}
            />
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
                <StyledName name={name} style={nameStyle} className="text-[1rem] font-semibold" />
              </UserLink>
            ) : (
              <StyledName name={name} style={nameStyle} className="text-[1rem] font-semibold" />
            )}
            {m.author?.roleName && (
              // A group badge beside the name, as TeamSpeak shows it.
              <span className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-1.5 py-px text-[11px] font-medium text-muted">
                {grouped ? null : m.author.roleIcon ? (
                  <RoleIcon url={m.author.roleIcon.url} />
                ) : (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: m.author.roleColor ?? 'var(--c-text-muted)' }}
                  />
                )}
                <StyledName
                  name={m.author.roleName}
                  style={grouped ? undefined : m.author.roleStyle}
                />
              </span>
            )}
            <time
              dateTime={m.createdAt}
              title={fullDateTime(m.createdAt, prefs.timeFormat, locale)}
              className="text-xs text-muted"
            >
              {grouped
                ? time
                : formatStamp(
                    m.createdAt,
                    prefs.timeFormat,
                    {
                      today: (time) => t('todayAt', { time }),
                      yesterday: (time) => t('yesterdayAt', { time }),
                    },
                    locale,
                  )}
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
                  title={fullDateTime(m.editedAt, prefs.timeFormat, locale)}
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
            'absolute end-4 -top-4 flex items-center gap-0.5 rounded-ui border border-border bg-surface p-0.5 opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
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
