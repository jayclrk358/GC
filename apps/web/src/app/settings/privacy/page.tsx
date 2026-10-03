import { getTranslations } from 'next-intl/server';
import { listBlockedUsers } from '@gamecentral/core';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/misc';
import { BlockedUsers } from '@/components/settings/blocked-users';

export const metadata = { title: 'Privacy & safety' };

export default async function PrivacySettingsPage() {
  const user = await requireUser('/settings/privacy');
  const t = await getTranslations('privacy');
  const blocked = await listBlockedUsers(user.id);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <section
        aria-labelledby="blocked-h"
        className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-5"
      >
        <h2 id="blocked-h" className="text-lg font-bold">
          {t('blockedTitle')}
        </h2>
        <p className="text-sm text-muted">{t('blockedDescription')}</p>
        <BlockedUsers users={blocked} />
      </section>
    </div>
  );
}
