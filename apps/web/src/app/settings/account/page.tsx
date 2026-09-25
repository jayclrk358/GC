import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@magnox/auth';
import { PageHeader } from '@/components/ui/misc';
import { AccountForms } from '@/components/settings/account-forms';
import { requireUser } from '@/lib/auth';

export const metadata = { title: 'Account' };

export default async function AccountSettingsPage() {
  const user = await requireUser('/settings/account');
  const t = await getTranslations('account');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <AccountForms
        user={{ name: user.name, email: user.email, emailVerified: user.emailVerified }}
        providers={enabledSocialProviders()}
      />
    </div>
  );
}
