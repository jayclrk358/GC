'use client';

import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/section';

/** Download everything Game Central keeps about you. */
export function DataExport() {
  const t = useTranslations('account.data');
  return (
    <SettingsSection id="data" title={t('title')} description={t('description')}>
      <Button asChild variant="outline">
        {/* A plain link: the browser downloads the file. */}
        <a href="/settings/account/export" download>
          <Download aria-hidden /> {t('download')}
        </a>
      </Button>
    </SettingsSection>
  );
}
