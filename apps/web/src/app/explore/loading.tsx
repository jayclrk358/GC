import { getTranslations } from 'next-intl/server';
import { FilterGridSkeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');
  return <FilterGridSkeleton label={t('loading')} />;
}
