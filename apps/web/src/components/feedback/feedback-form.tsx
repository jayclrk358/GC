'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_TITLE_MAX,
  type FeedbackKind,
} from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-cards';
import { FormError } from '@/components/auth/form-error';
import { replyToFeedbackAction, submitFeedbackAction } from '@/app/actions/feedback';

/** Tell Magnox's team about a bug, an idea or a question. */
export function FeedbackForm({ from }: { from: string | null }) {
  const t = useTranslations('feedback');
  const router = useRouter();
  const [kind, setKind] = React.useState<FeedbackKind>('idea');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [includePage, setIncludePage] = React.useState(Boolean(from));
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const r = await submitFeedbackAction({
          kind,
          title,
          body,
          page: includePage ? from : null,
        });
        setPending(false);
        if (r.ok) {
          toast.success(t('sent'));
          router.push(`/feedback/${r.data.id}`);
        } else {
          setError(r.error);
          setFields(r.fields ?? {});
        }
      }}
    >
      <FormError message={error} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('kindLabel')}</legend>
        <RadioCards
          label={t('kindLabel')}
          columns={2}
          value={kind}
          onValueChange={setKind}
          options={FEEDBACK_KINDS.map((k) => ({
            value: k,
            label: t(`kinds.${k}.name`),
            description: t(`kinds.${k}.description`),
          }))}
        />
      </fieldset>
      <Field label={t('titleLabel')} error={fields.title} required>
        {(p) => (
          <Input
            {...p}
            value={title}
            maxLength={FEEDBACK_TITLE_MAX}
            placeholder={t(`kinds.${kind}.titlePlaceholder`)}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('bodyLabel')}
        description={t(`kinds.${kind}.bodyHint`)}
        error={fields.body}
        required
      >
        {(p) => (
          <Textarea
            {...p}
            rows={7}
            value={body}
            maxLength={FEEDBACK_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      </Field>
      {from && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includePage}
            onChange={(e) => setIncludePage(e.target.checked)}
          />
          <span>
            {t('includePage')} <code className="text-xs break-all">{from}</code>
          </span>
        </label>
      )}
      <p className="text-xs text-muted">{t('privacyNote')}</p>
      <div>
        <Button type="submit" loading={pending}>
          {t('send')}
        </Button>
      </div>
    </form>
  );
}

/** Add to your own feedback. */
export function FeedbackReply({ feedbackId }: { feedbackId: string }) {
  const t = useTranslations('feedback');
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const r = await replyToFeedbackAction(feedbackId, { body });
        setPending(false);
        if (r.ok) {
          setBody('');
          router.refresh();
        } else setError(r.fields?.body ?? r.error);
      }}
    >
      <Field label={t('addReply')} error={error ?? undefined}>
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            value={body}
            maxLength={FEEDBACK_REPLY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          {t('sendReply')}
        </Button>
      </div>
    </form>
  );
}
