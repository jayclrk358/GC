'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { unbanAction } from '@/app/actions/moderation';

export function UnbanButton({
  communityId,
  userId,
  name,
}: {
  communityId: string;
  userId: string;
  name: string;
}) {
  const t = useTranslations('moderation');
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={t('unbanNamed', { name })}
      onClick={async () => {
        const r = await unbanAction(communityId, userId);
        if (r.ok) {
          toast.success(t('unbanned', { name }));
          router.refresh();
        } else toast.error(r.error);
      }}
    >
      {t('unban')}
    </Button>
  );
}
