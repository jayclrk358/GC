import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/misc';
import { SecurityPanel } from '@/components/settings/security-panel';
import { getSession, requireUser } from '@/lib/auth';

export const metadata = { title: 'Security' };

export default async function SecuritySettingsPage() {
  const user = await requireUser('/settings/security');
  const session = await getSession();
  const t = await getTranslations('security');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <SecurityPanel
        twoFactorEnabled={Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled)}
        currentSessionToken={session?.session.token ?? ''}
      />
    </div>
  );
}
