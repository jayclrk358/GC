import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@magnox/auth';
import { ownedCommunities } from '@magnox/core';
import { PageHeader } from '@/components/ui/misc';
import { AccountForms } from '@/components/settings/account-forms';
import { DataExport } from '@/components/settings/data-export';
import { DeleteAccount } from '@/components/settings/delete-account';
import { requireUser } from '@/lib/auth';

export const metadata = { title: 'Account' };

export default async function AccountSettingsPage() {
  const user = await requireUser('/settings/account');
  const [t, owned] = await Promise.all([getTranslations('account'), ownedCommunities(user.id)]);
  const username = (user as { username?: string | null }).username;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <AccountForms
        user={{ name: user.name, email: user.email, emailVerified: user.emailVerified }}
        providers={enabledSocialProviders()}
      />
      <DataExport />
      <DeleteAccount confirmWord={username ?? user.email} owned={owned} />
    </div>
  );
}
