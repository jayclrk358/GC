import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listEmoji } from '@magnox/core';
import { planLimits } from '@magnox/shared';
import { loadCommunityForSettings } from '@/lib/community';
import { PageHeader } from '@/components/ui/misc';
import { EmojiManager } from '@/components/emoji/emoji-manager';

export const metadata = { title: 'Emoji' };

export default async function EmojiSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { community, perms } = await loadCommunityForSettings(slug);
  if (!perms.manageEmoji) notFound();
  const [t, emoji] = await Promise.all([getTranslations('emoji'), listEmoji(community.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmojiManager
        communityId={community.id}
        emoji={emoji}
        limit={planLimits(community.plan).emoji}
      />
    </div>
  );
}
