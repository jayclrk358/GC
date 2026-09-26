import { getTranslations } from 'next-intl/server';
import { listGames } from '@magnox/core';
import { requireUser } from '@/lib/auth';
import { CreateWizard } from '@/components/community/create-wizard';

export const metadata = { title: 'Create a community' };

export default async function NewCommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  await requireUser('/new');
  const t = await getTranslations('create');
  const games = await listGames();
  const { welcome } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {welcome && (
        <p className="mb-4 rounded-ui bg-primary/10 px-4 py-3 font-semibold text-primary">
          {t('welcome')}
        </p>
      )}
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('subtitle')}</p>
      <CreateWizard games={games} />
    </div>
  );
}
