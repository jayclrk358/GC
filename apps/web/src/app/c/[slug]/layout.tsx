import type { Metadata } from 'next';
import { onlineInCommunity, voicePeople } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { planPerks } from '@magnox/shared';
import { imgSources } from '@/lib/media';
import { CommunityHeader } from '@/components/community/community-header';
import { CommunityThemeStyle } from '@/components/community/theme-style';
import { DenseOnChat } from '@/components/community/dense-on-chat';
import { CommunityLive } from '@/components/live/live';
import { VoiceBar } from '@/components/voice/voice-bar';
import { VoiceProvider } from '@/components/voice/voice-provider';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { community } = await loadCommunity((await params).slug);
  return {
    title: { default: community.name, template: `%s · ${community.name} · Magnox` },
    description: community.tagline || undefined,
    robots: community.visibility === 'public' ? undefined : { index: false },
  };
}

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const data = await loadCommunity((await params).slug);
  const [online, voice] = await Promise.all([
    onlineInCommunity(data.community.id),
    voicePeople(data.community.id),
  ]);
  // The background picture is a paid perk; a community on Free keeps it set but not shown.
  const bg = planPerks(data.community.plan).pageBackground
    ? imgSources(data.community.theme.backgroundKey, 'md', '100vw')
    : null;
  return (
    <div
      data-community-theme
      className="relative isolate flex flex-1 flex-col bg-bg font-sans text-fg"
    >
      <CommunityThemeStyle theme={data.community.theme} />
      <CommunityLive communityId={data.community.id} userId={data.user?.id ?? null} />
      {bg && (
        <div
          aria-hidden
          data-decorative
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...bg} alt="" decoding="async" className="size-full object-cover" />
          <div
            className="absolute inset-0 bg-bg"
            style={{ opacity: data.community.theme.backgroundDim / 100 }}
          />
        </div>
      )}
      <VoiceProvider communityId={data.community.id} initialPeople={voice}>
        <DenseOnChat slug={data.community.slug}>
          <CommunityHeader data={data} online={online} />
          <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col px-4 py-8 group-data-[dense=true]/dense:min-h-0 group-data-[dense=true]/dense:px-2 group-data-[dense=true]/dense:py-2 sm:px-6 sm:group-data-[dense=true]/dense:px-4 lg:px-8">
            <VoiceBar slug={data.community.slug} />
            {children}
          </div>
        </DenseOnChat>
      </VoiceProvider>
    </div>
  );
}
