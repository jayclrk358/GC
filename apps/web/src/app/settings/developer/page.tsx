import { getTranslations } from 'next-intl/server';
import { listApiTokens } from '@gamecentral/core';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/misc';
import { ApiTokens } from '@/components/developer/api-tokens';

export const metadata = { title: 'Developer settings' };

export default async function DeveloperSettingsPage() {
  const user = await requireUser('/settings/developer');
  const t = await getTranslations('developer');
  const tokens = await listApiTokens(user.id);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <ApiTokens tokens={tokens} />
    </div>
  );
}
