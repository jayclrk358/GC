'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import type { ApplicationView } from '@magnox/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { reviewApplicationAction } from '@/app/actions/applications';
import { formatDateTime, relativeTime } from '@/lib/format';

type Decision = 'approve' | 'reject';

/** Applications to read and answer (or, for past ones, to look back on). */
export function ReviewQueue({
  communityId,
  applications,
}: {
  communityId: string;
  applications: ApplicationView[];
}) {
  const t = useTranslations('applications');
  const router = useRouter();
  const [deciding, setDeciding] = React.useState<{
    app: ApplicationView;
    decision: Decision;
  } | null>(null);
  const [message, setMessage] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function decide() {
    if (!deciding) return;
    setPending(true);
    const r = await reviewApplicationAction(communityId, deciding.app.id, {
      decision: deciding.decision,
      message,
    });
    setPending(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      deciding.decision === 'approve'
        ? t('acceptedToast', { name: deciding.app.applicant.name })
        : t('rejectedToast', { name: deciding.app.applicant.name }),
    );
    setDeciding(null);
    setMessage('');
    router.refresh();
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {applications.map((a) => (
          <li key={a.id}>
            <article
              aria-labelledby={`app-${a.id}`}
              className="flex flex-col gap-4 rounded-ui-lg border border-border bg-surface p-5"
            >
              <header className="flex flex-wrap items-center gap-3">
                <Avatar src={a.applicant.image} name={a.applicant.name} size={40} />
                <div className="min-w-0 flex-1">
                  <h3 id={`app-${a.id}`} className="font-bold">
                    {a.applicant.username ? (
                      <Link href={`/u/${a.applicant.username}`} className="hover:underline">
                        {a.applicant.name}
                      </Link>
                    ) : (
                      a.applicant.name
                    )}
                  </h3>
                  {/* Times read differently on the server and in the browser a moment later. */}
                  <p className="text-sm text-muted" suppressHydrationWarning>
                    {t('appliedWhen', { when: relativeTime(a.createdAt) })} ·{' '}
                    {t('accountAge', { when: relativeTime(a.applicant.since) })}
                  </p>
                </div>
                {a.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDeciding({ app: a, decision: 'reject' })}
                      aria-label={t('rejectFor', { name: a.applicant.name })}
                    >
                      <X aria-hidden /> {t('reject')}
                    </Button>
                    <Button
                      onClick={() => setDeciding({ app: a, decision: 'approve' })}
                      aria-label={t('acceptFor', { name: a.applicant.name })}
                    >
                      <Check aria-hidden /> {t('accept')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted" suppressHydrationWarning>
                    {t(a.status === 'approved' ? 'acceptedBy' : 'rejectedBy', {
                      name: a.reviewerName ?? t('someone'),
                      when: a.reviewedAt ? formatDateTime(a.reviewedAt) : '',
                    })}
                  </p>
                )}
              </header>
              <dl className="flex flex-col gap-3">
                {a.answers.map((ans) => (
                  <div key={ans.questionId}>
                    <dt className="text-sm font-semibold text-muted">{ans.label}</dt>
                    <dd className="whitespace-pre-wrap">
                      {Array.isArray(ans.value)
                        ? ans.value.join(', ') || t('noAnswer')
                        : ans.value || t('noAnswer')}
                    </dd>
                  </div>
                ))}
              </dl>
              {a.message && (
                <p className="rounded-ui border-s-4 border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-semibold">{t('messageSent')}: </span>
                  {a.message}
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>

      <Dialog open={deciding !== null} onOpenChange={(o) => !o && setDeciding(null)}>
        {deciding && (
          <DialogContent
            size="sm"
            title={
              deciding.decision === 'approve'
                ? t('acceptTitle', { name: deciding.app.applicant.name })
                : t('rejectTitle', { name: deciding.app.applicant.name })
            }
            description={deciding.decision === 'approve' ? t('acceptExplain') : t('rejectExplain')}
          >
            <Field label={t('messageLabel')} description={t('messageHint')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeciding(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant={deciding.decision === 'approve' ? 'primary' : 'danger'}
                loading={pending}
                onClick={() => void decide()}
              >
                {deciding.decision === 'approve' ? t('accept') : t('reject')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
