import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/misc';
import { PrefsEditor } from '@/components/settings/prefs-editor';

export const metadata = { title: 'Accessibility & display' };

/** Available to everyone, signed in or not: preferences are stored in a cookie too. */
export default async function AccessibilitySettingsPage() {
  const t = await getTranslations('prefs');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('intro')} />
      <PrefsEditor />
    </div>
  );
}
