import Link from '@/components/ui/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Community suspended', robots: { index: false } };

/** Where a suspended community's address leads. */
export default async function CommunitySuspendedPage() {
  const t = await getTranslations('suspended');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="text-muted">{t('body')}</p>
      <Button asChild>
        <Link href="/explore">{t('explore')}</Link>
      </Button>
    </div>
  );
}
