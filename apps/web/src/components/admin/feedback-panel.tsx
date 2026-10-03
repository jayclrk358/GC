'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FEEDBACK_REPLY_MAX, FEEDBACK_STATUSES, type FeedbackStatus } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/section';
import { replyFeedbackAction, setFeedbackStatusAction } from '@/app/actions/admin';

/** The team's controls on a piece of feedback: where it's at, and a reply or a note. */
export function FeedbackPanel({ id, status }: { id: string; status: FeedbackStatus }) {
  const t = useTranslations('admin.feedback');
  const tf = useTranslations('feedback');
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <SettingsSection id="status" title={t('statusTitle')} description={t('statusDescription')}>
        <Field label={t('status')}>
          {(p) => (
            <Select
              {...p}
              value={status}
              className="max-w-64"
              onValueChange={async (v) => {
                const r = await setFeedbackStatusAction(id, { status: v });
                if (r.ok) {
                  toast.success(t('statusSaved', { status: tf(`status.${v as FeedbackStatus}`) }));
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tf(`status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </SettingsSection>
      <SettingsSection id="reply" title={t('replyTitle')} description={t('replyDescription')}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            const r = await replyFeedbackAction(id, { body, internal });
            setPending(false);
            if (r.ok) {
              setBody('');
              toast.success(internal ? t('noteSaved') : t('replySent'));
              router.refresh();
            } else setError(r.fields?.body ?? r.error);
          }}
        >
          <Field label={internal ? t('noteLabel') : t('replyLabel')} error={error ?? undefined}>
            {(p) => (
              <Textarea
                {...p}
                rows={5}
                value={body}
                maxLength={FEEDBACK_REPLY_MAX}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
          </Field>
          <SwitchField
            label={t('internal')}
            description={t('internalDescription')}
            checked={internal}
            onCheckedChange={setInternal}
          />
          <div>
            <Button type="submit" loading={pending}>
              {internal ? t('saveNote') : t('sendReply')}
            </Button>
          </div>
        </form>
      </SettingsSection>
    </>
  );
}
