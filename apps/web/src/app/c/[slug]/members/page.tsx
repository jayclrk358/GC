import { getTranslations } from 'next-intl/server';
import { listMembers, listRoles, roleSummary } from '@magnox/core';
import { loadCommunity } from '@/lib/community';
import { getPrefs } from '@/lib/prefs';
import { MemberList } from '@/components/community/member-list';
import { MemberSearch } from '@/components/community/member-search';

export const metadata = { title: 'Members' };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const data = await loadCommunity((await params).slug);
  const { q, page } = await searchParams;
  const t = await getTranslations('community');
  const pageNum = Math.max(0, Number(page ?? 0) || 0);
  const [{ members, hasMore }, roles, prefs] = await Promise.all([
    listMembers(data.community.id, data.community.ownerId, { q, limit: 60, offset: pageNum * 60 }),
    listRoles(data.community.id),
    getPrefs(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold">{t('tabs.members')}</h2>
        <MemberSearch defaultValue={q ?? ''} />
      </div>
      <MemberList
        members={members}
        roles={roles.map(roleSummary)}
        colorblind={prefs.colorblindRoleColors}
        query={q ?? ''}
      />
      <nav aria-label={t('pagination')} className="flex justify-between">
        {pageNum > 0 ? (
          <a className="font-semibold text-primary underline" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNum - 1) })}`}>
            {t('previous')}
          </a>
        ) : (
          <span />
        )}
        {hasMore && (
          <a className="font-semibold text-primary underline" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNum + 1) })}`}>
            {t('next')}
          </a>
        )}
      </nav>
    </div>
  );
}
