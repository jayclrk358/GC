'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Clock, DoorOpen, Gavel } from 'lucide-react';
import { BAN_DURATIONS, TIMEOUT_DURATIONS } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { banAction, kickAction, timeoutAction } from '@/app/actions/moderation';

type Mode = 'timeout' | 'kick' | 'ban' | null;

const DELETE_WINDOWS = { none: 0, '1h': 3600, '1d': 86400, '7d': 7 * 86400 } as const;

export function MemberModActions({
  communityId,
  member,
  can,
}: {
  communityId: string;
  member: { userId: string; name: string; timeoutUntil: string | null };
  can: { kick: boolean; ban: boolean; timeout: boolean };
}) {
  const t = useTranslations('moderation');
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [reason, setReason] = React.useState('');
  const [duration, setDuration] = React.useState('');
  const [deleteWindow, setDeleteWindow] = React.useState<keyof typeof DELETE_WINDOWS>('none');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());

  function open(m: Mode) {
    setMode(m);
    setReason('');
    setError(null);
    setDuration(m === 'timeout' ? '10m' : m === 'ban' ? 'permanent' : '');
    setDeleteWindow('none');
  }

  async function submit() {
    setPending(true);
    setError(null);
    const r =
      mode === 'kick'
        ? await kickAction(communityId, member.userId, reason)
        : mode === 'ban'
          ? await banAction(communityId, member.userId, {
              reason,
              duration,
              deleteSeconds: DELETE_WINDOWS[deleteWindow],
            })
          : await timeoutAction(communityId, member.userId, { reason, duration });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(t(`${mode!}Done`, { name: member.name }));
    setMode(null);
    router.refresh();
  }

  async function clearTimeout() {
    const r = await timeoutAction(communityId, member.userId, { reason: '', duration: null });
    if (r.ok) {
      toast.success(t('timeoutCleared', { name: member.name }));
      router.refresh();
    } else toast.error(r.error);
  }

  if (!can.kick && !can.ban && !can.timeout) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Gavel aria-hidden /> {t('moderate')}
            <span className="sr-only"> {member.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {can.timeout &&
            (timedOut ? (
              <DropdownMenuItem onSelect={() => void clearTimeout()}>
                <Clock aria-hidden /> {t('removeTimeout')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => open('timeout')}>
                <Clock aria-hidden /> {t('timeout')}
              </DropdownMenuItem>
            ))}
          {can.kick && (
            <DropdownMenuItem onSelect={() => open('kick')}>
              <DoorOpen aria-hidden /> {t('kick')}
            </DropdownMenuItem>
          )}
          {can.ban && (
            <DropdownMenuItem className="text-danger" onSelect={() => open('ban')}>
              <Ban aria-hidden /> {t('ban')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        {mode && (
          <DialogContent
            size="sm"
            title={t(`${mode}Title`, { name: member.name })}
            description={t(`${mode}Explain`)}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <FormError message={error} />
              {mode !== 'kick' && (
                <Field label={t('duration')}>
                  {(p) => (
                    <Select {...p} value={duration} onValueChange={(v) => setDuration(v)}>
                      {Object.keys(mode === 'ban' ? BAN_DURATIONS : TIMEOUT_DURATIONS).map((k) => (
                        <option key={k} value={k}>
                          {t(`durations.${k}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              {mode === 'ban' && (
                <Field label={t('deleteRecent')} description={t('deleteRecentHint')}>
                  {(p) => (
                    <Select
                      {...p}
                      value={deleteWindow}
                      onValueChange={(v) => setDeleteWindow(v as keyof typeof DELETE_WINDOWS)}
                    >
                      {Object.keys(DELETE_WINDOWS).map((k) => (
                        <option key={k} value={k}>
                          {t(`deleteWindows.${k}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label={t('reason')} description={t('reasonHint')}>
                {(p) => (
                  <Textarea
                    {...p}
                    value={reason}
                    maxLength={500}
                    rows={3}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  variant={mode === 'timeout' ? 'primary' : 'danger'}
                  loading={pending}
                >
                  {t(`${mode}Confirm`)}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
