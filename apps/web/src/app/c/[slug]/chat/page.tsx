import Link from '@/components/ui/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MessagesSquare } from 'lucide-react';
import { loadChatChannels, loadCommunity } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'Chat' };

export default async function ChatIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, { channels }] = await Promise.all([loadCommunity(slug), loadChatChannels(slug)]);
  const first = channels.find((c) => c.type === 'text') ?? channels.find((c) => c.type === 'voice');
  if (first) redirect(`/c/${slug}/chat/${first.name}`);
  const t = await getTranslations('chat');
  return (
    <div className="grid flex-1 place-items-center p-6">
      <h2 className="sr-only">{t('title')}</h2>
      <EmptyState
        icon={<MessagesSquare />}
        title={t('noChannels')}
        description={data.perms.manageChannels ? t('noChannelsManage') : undefined}
        action={
          data.perms.manageChannels ? (
            <Button asChild>
              <Link href={`/c/${slug}/settings/channels`}>{t('manageChannels')}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
