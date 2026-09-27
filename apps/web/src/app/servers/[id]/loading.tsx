import { getTranslations } from 'next-intl/server';
import { PageSkeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');
  return <PageSkeleton label={t('loading')} />;
}
