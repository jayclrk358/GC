import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { getOnboarding, isOnboarded, listRoles, mediaUrl } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { WelcomeSteps } from '@/components/onboarding/welcome-steps';

export const metadata = { title: 'Welcome' };

export default async function WelcomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, t] = await Promise.all([loadCommunity(slug), getTranslations('welcome')]);
  const { ctx, community, user } = data;
  if (!user || !ctx.isMember) redirect(`/c/${slug}`);
  const [onboarding, roles, onboarded] = await Promise.all([
    getOnboarding(community.id),
    listRoles(community.id),
    isOnboarded(ctx),
  ]);
  const pickable = roles
    .filter((r) => r.selfAssignable && !r.isDefault)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, iconUrl: mediaUrl(r.iconKey) }));
  const rules = onboarding.enabled ? onboarding.rules : [];
  const welcome = onboarding.enabled ? onboarding.welcome : '';
  if (!rules.length && !pickable.length && !welcome) redirect(`/c/${slug}`);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-ui-lg bg-primary/12 text-primary"
        >
          <Sparkles className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">{t('title', { name: community.name })}</h2>
          <p className="text-muted">{onboarded ? t('subtitleDone') : t('subtitle')}</p>
        </div>
      </div>
      <WelcomeSteps
        communityId={community.id}
        slug={slug}
        meId={user.id}
        welcome={welcome}
        rules={rules}
        roles={pickable}
        initialRoleIds={ctx.roleIds}
        onboarded={onboarded}
      />
    </div>
  );
}
