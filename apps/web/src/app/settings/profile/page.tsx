import { getTranslations } from 'next-intl/server';
import { getOwnProfile, listGames } from '@magnox/core';
import { PageHeader } from '@/components/ui/misc';
import { ProfileForm } from '@/components/settings/profile-form';
import { requireUser } from '@/lib/auth';

export const metadata = { title: 'Profile' };

export default async function ProfileSettingsPage() {
  const user = await requireUser('/settings/profile');
  const t = await getTranslations('profile');
  const [profile, games] = await Promise.all([getOwnProfile(user.id), listGames()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('settingsTitle')} description={t('settingsDescription')} />
      <ProfileForm
        username={(user as { username?: string | null }).username ?? ''}
        games={games}
        initial={{
          bio: profile?.bio ?? '',
          pronouns: profile?.pronouns ?? '',
          location: profile?.location ?? '',
          accentColor: profile?.accentColor ?? null,
          links: profile?.links ?? [],
          favoriteGames: profile?.favoriteGames ?? [],
          avatarKey: profile?.avatarKey ?? null,
          bannerKey: profile?.bannerKey ?? null,
        }}
      />
    </div>
  );
}
