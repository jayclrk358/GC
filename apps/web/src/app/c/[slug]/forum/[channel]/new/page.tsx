import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listFlairs } from '@magnox/core';
import { has, Permission } from '@magnox/shared';
import { loadCommunity, loadForumChannel } from '@/lib/community';
import { ThreadComposer } from '@/components/forum/thread-composer';

export const metadata = { title: 'New thread' };

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string }>;
}) {
  const { slug, channel: channelName } = await params;
  const data = await loadCommunity(slug);
  if (!data.user)
    redirect(`/sign-in?next=${encodeURIComponent(`/c/${slug}/forum/${channelName}/new`)}`);
  const channel = await loadForumChannel(data.ctx, channelName);
  const perms = BigInt(channel.perms);
  const isMod = has(perms, Permission.MANAGE_THREADS);
  if (!has(perms, Permission.CREATE_THREADS) || (channel.type === 'announcement' && !isMod))
    notFound();
  const t = await getTranslations('forum');
  const flairs = (await listFlairs(data.community.id, channel.id)).filter(
    (f) => isMod || !f.modOnly,
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <nav aria-label={t('breadcrumb')} className="text-sm text-muted">
        <Link href={`/c/${slug}/forum`} className="hover:underline">
          {t('title')}
        </Link>{' '}
        ›{' '}
        <Link href={`/c/${slug}/forum/${channel.name}`} className="hover:underline">
          {channel.name}
        </Link>{' '}
        › {t('newThread')}
      </nav>
      <h2 className="text-2xl font-bold">{t('newThreadIn', { channel: channel.name })}</h2>
      <ThreadComposer
        communityId={data.community.id}
        channelId={channel.id}
        flairs={flairs.map((f) => ({ id: f.id, name: f.name, color: f.color }))}
        requireFlair={Boolean(channel.settings.requireFlair)}
        canPoll={has(perms, Permission.VOTE) || isMod}
        requireAlt={Boolean(data.community.settings.requireAltText)}
      />
    </div>
  );
}
