'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell, BellOff, Lock, Pin, Settings2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { markThreadReadAction, moderateThreadAction, setFollowAction } from '@/app/actions/forum';

export function FollowButton({
  communityId,
  threadId,
  following: initial,
}: {
  communityId: string;
  threadId: string;
  following: boolean;
}) {
  const t = useTranslations('forum');
  const [following, setFollowing] = React.useState(initial);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        setFollowing(!following);
        const r = await setFollowAction(communityId, threadId, !following);
        if (!r.ok) {
          setFollowing(following);
          toast.error(r.error);
        } else toast.success(!following ? t('followed') : t('unfollowed'));
      }}
    >
      {following ? <BellOff aria-hidden /> : <Bell aria-hidden />}
      {following ? t('unfollow') : t('follow')}
    </Button>
  );
}

export function ModTools({
  communityId,
  threadId,
  pinned,
  locked,
  channelId,
  flairId,
  channels,
  flairs,
  isMod,
}: {
  communityId: string;
  threadId: string;
  pinned: boolean;
  locked: boolean;
  channelId: string;
  flairId: string | null;
  channels: { id: string; name: string }[];
  flairs: { id: string; name: string }[];
  isMod: boolean;
}) {
  const t = useTranslations('forum');
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState(channelId);
  const [flair, setFlair] = React.useState(flairId ?? '');

  async function apply(input: Record<string, unknown>, message: string) {
    // The action sends back the updated page itself.
    const r = await moderateThreadAction(communityId, threadId, input);
    if (r.ok) toast.success(message);
    else toast.error(r.error);
  }

  return (
    <>
      {isMod && (
        <>
          <Button
            size="sm"
            variant="outline"

            onClick={() =>
              void apply({ pinned: !pinned }, pinned ? t('unpinnedToast') : t('pinnedToast'))
            }
          >
            <Pin aria-hidden /> {pinned ? t('unpin') : t('pin')}
          </Button>
          <Button
            size="sm"
            variant="outline"

            onClick={() =>
              void apply({ locked: !locked }, locked ? t('unlockedToast') : t('lockedToast'))
            }
          >
            {locked ? <Unlock aria-hidden /> : <Lock aria-hidden />}{' '}
            {locked ? t('unlock') : t('lock')}
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden /> {isMod ? t('moveOrFlair') : t('changeFlair')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={isMod ? t('moveOrFlair') : t('changeFlair')} size="sm">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const input: Record<string, unknown> = { flairId: flair || null };
              if (isMod && target !== channelId) input.channelId = target;
              await apply(input, t('threadUpdated'));
              setOpen(false);
            }}
          >
            {isMod && (
              <Field label={t('moveTo')}>
                {(p) => (
                  <Select {...p} value={target} onValueChange={(v) => setTarget(v)}>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label={t('flair')}>
              {(p) => (
                <Select {...p} value={flair} onValueChange={(v) => setFlair(v)}>
                  <option value="">{t('noFlair')}</option>
                  {flairs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit">{t('saveEdit')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReadMarker({
  threadId,
  lastPostId,
}: {
  threadId: string;
  lastPostId: string | null;
}) {
  React.useEffect(() => {
    void markThreadReadAction(threadId, lastPostId);
  }, [threadId, lastPostId]);
  return null;
}
