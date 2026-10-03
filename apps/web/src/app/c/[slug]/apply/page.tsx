import Link from '@/components/ui/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ClipboardList } from 'lucide-react';
import { getApplicationForm, myApplication } from '@gamecentral/core';
import { loadCommunity } from '@/lib/community';
import { Alert } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ApplyForm, WithdrawButton } from '@/components/applications/apply-form';

export const metadata = { title: 'Apply to join' };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, t] = await Promise.all([loadCommunity(slug), getTranslations('applications')]);
  const { ctx, community, user } = data;
  if (ctx.isMember) redirect(`/c/${slug}`);

  let body: React.ReactNode;
  if (community.joinMode !== 'apply') {
    body = <p className="text-muted">{t('notTaking')}</p>;
  } else if (!user) {
    body = (
      <p>
        <Button asChild>
          <Link href={`/sign-in?next=${encodeURIComponent(`/c/${slug}/apply`)}`}>
            {t('signInToApply')}
          </Link>
        </Button>
      </p>
    );
  } else {
    const [form, mine] = await Promise.all([getApplicationForm(community.id), myApplication(ctx)]);
    if (mine?.status === 'pending') {
      body = (
        <div className="flex flex-col gap-4">
          <Alert tone="info" title={t('pendingTitle')}>
            {t('pendingBody')}
          </Alert>
          <div>
            <WithdrawButton communityId={community.id} />
          </div>
        </div>
      );
    } else {
      body = (
        <div className="flex flex-col gap-5">
          {mine?.status === 'rejected' && (
            <Alert tone="warning" title={t('rejectedTitle')}>
              {mine.message ? <p className="whitespace-pre-wrap">{mine.message}</p> : null}
              <p>{t('rejectedAgain')}</p>
            </Alert>
          )}
          {form.intro && <p className="whitespace-pre-wrap">{form.intro}</p>}
          <ApplyForm communityId={community.id} form={form} />
        </div>
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-ui-lg bg-primary/12 text-primary"
        >
          <ClipboardList className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">{t('title', { name: community.name })}</h2>
          <p className="text-muted">{t('subtitle')}</p>
        </div>
      </div>
      {body}
    </div>
  );
}
