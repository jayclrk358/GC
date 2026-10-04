'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/section';
import { resetTwoFactorAction } from '@/app/actions/admin';

/** Turn off two-factor for someone who has lost their authenticator app and backup codes. */
export function TwoFactorReset({ userId }: { userId: string }) {
  const t = useTranslations('admin.twoFactor');
  const router = useRouter();
  const [sure, setSure] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <SettingsSection id="two-factor" title={t('title')} description={t('description')}>
      <div className="flex flex-wrap gap-2">
        {sure ? (
          <>
            <Button
              variant="danger"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const r = await resetTwoFactorAction(userId);
                setPending(false);
                if (r.ok) {
                  toast.success(t('done'));
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              {t('confirm')}
            </Button>
            <Button variant="ghost" onClick={() => setSure(false)}>
              {t('cancel')}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setSure(true)}>
            {t('reset')}
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}
