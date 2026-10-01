'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmAdultAction } from '@/app/actions/account';

/** Shown instead of a community marked 18+ until the visitor says they're an adult. */
export function AdultGate({ name, signedIn }: { name: string; signedIn: boolean }) {
  const t = useTranslations('legal');
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
      <ShieldAlert aria-hidden className="size-12 text-warning" />
      <h1 className="text-2xl font-bold">{t('adultTitle', { name })}</h1>
      <p className="text-muted">{t('adultBody')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/explore">{t('adultLeave')}</Link>
        </Button>
        <Button
          loading={pending}
          onClick={async () => {
            setPending(true);
            if (signedIn) {
              const r = await confirmAdultAction();
              if (!r.ok) {
                setPending(false);
                return toast.error(r.error);
              }
            } else {
              // Remembered in this browser for a year.
              document.cookie = 'mx-adult=1; path=/; max-age=31536000; samesite=lax';
            }
            router.refresh();
          }}
        >
          {t('adultConfirm')}
        </Button>
      </div>
    </div>
  );
}
