import { getTranslations } from 'next-intl/server';
import { getNotificationSettings, listMutes } from '@magnox/core';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/misc';
import { MuteList, NotificationSettingsForm } from '@/components/settings/notification-settings';

export const metadata = { title: 'Notification settings' };

export default async function NotificationSettingsPage() {
  const user = await requireUser('/settings/notifications');
  const t = await getTranslations('notifications');
  const [settings, mutes] = await Promise.all([
    getNotificationSettings(user.id),
    listMutes(user.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('settingsTitle')} description={t('settingsDescription')} />
      <NotificationSettingsForm initial={settings} />
      <MuteList mutes={mutes.map((m) => ({ ...m, until: m.until?.toISOString() ?? null }))} />
    </div>
  );
}
