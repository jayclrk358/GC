import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/misc';
import { SoundsEditor } from '@/components/settings/sounds-editor';

export async function generateMetadata() {
  const t = await getTranslations('sounds');
  return { title: t('title') };
}

/** Like the other display settings, open to everyone: they're kept in a cookie too. */
export default async function SoundSettingsPage() {
  const t = await getTranslations('sounds');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('intro')} />
      <SoundsEditor />
    </div>
  );
}
