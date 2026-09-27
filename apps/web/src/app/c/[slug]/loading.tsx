import { getTranslations } from 'next-intl/server';
import { CommunityTabSkeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');
  return <CommunityTabSkeleton label={t('loading')} />;
}
