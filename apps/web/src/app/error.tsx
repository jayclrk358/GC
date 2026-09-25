'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center"
    >
      <h1 className="text-3xl font-bold">{t('errorTitle')}</h1>
      <p className="text-muted">{t('errorBody')}</p>
      <Button onClick={reset}>{t('tryAgain')}</Button>
    </div>
  );
}
