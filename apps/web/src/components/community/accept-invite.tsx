'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/auth/form-error';
import { acceptInviteAction } from '@/app/actions/invites';

export function AcceptInvite({ code }: { code: string }) {
  const t = useTranslations('invites');
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Button
        size="lg"
        loading={pending}
        onClick={async () => {
          setPending(true);
          const r = await acceptInviteAction(code);
          if (r.ok) {
            router.push(`/c/${r.data.slug}`);
            router.refresh();
          } else {
            setPending(false);
            setError(r.error);
          }
        }}
      >
        {t('accept')}
      </Button>
    </div>
  );
}
