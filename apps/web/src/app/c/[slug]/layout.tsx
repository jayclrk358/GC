import type { Metadata } from 'next';
import { onlineInCommunity } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { mediaUrl } from '@/lib/media';
import { CommunityHeader } from '@/components/community/community-header';
import { CommunityThemeStyle } from '@/components/community/theme-style';

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
  const online = await onlineInCommunity(data.community.id);
  const bg = mediaUrl(data.community.theme.backgroundKey);
  return (
    <div
      data-community-theme
      className="relative isolate flex flex-1 flex-col bg-bg font-sans text-fg"
    >
      <CommunityThemeStyle theme={data.community.theme} />
      {bg && (
        <div
          aria-hidden
          data-decorative
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg} alt="" className="size-full object-cover" />
          <div
            className="absolute inset-0 bg-bg"
            style={{ opacity: data.community.theme.backgroundDim / 100 }}
          />
        </div>
      )}
      <CommunityHeader data={data} online={online} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">{children}</div>
    </div>
  );
}
