import { getTranslations } from 'next-intl/server';
import { enabledSocialProviders } from '@gamecentral/auth';
import { PageHeader } from '@/components/ui/misc';
import { SecurityPanel } from '@/components/settings/security-panel';
import { auth, getSession, requireUser } from '@/lib/auth';

export const metadata = { title: 'Security' };

/** How many unused backup codes someone has (none if two-factor is off). */
async function backupCodesLeft(userId: string): Promise<number> {
  try {
    const r = await auth.api.viewBackupCodes({ body: { userId } });
    return r.backupCodes.length;
  } catch {
    return 0;
  }
}

export default async function SecuritySettingsPage() {
  const user = await requireUser('/settings/security');
  const session = await getSession();
  const t = await getTranslations('security');
  const enabled = Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);
  const { internalAdapter } = await auth.$context;
  const [accounts, codesLeft] = await Promise.all([
    internalAdapter.findAccounts(user.id),
    enabled ? backupCodesLeft(user.id) : 0,
  ]);
  const social = new Set(enabledSocialProviders());
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <SecurityPanel
        twoFactor={{
          enabled,
          hasPassword: accounts.some((a) => a.providerId === 'credential' && a.password),
          backupCodesLeft: codesLeft,
          providers: accounts.map((a) => a.providerId).filter((p) => social.has(p)),
          account: (user as { username?: string | null }).username ?? user.email,
        }}
        currentSessionToken={session?.session.token ?? ''}
      />
    </div>
  );
}
