import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { loadCommunityForSettings } from '@/lib/community';
import { formatDateTime } from '@/lib/format';
import { getPrefs } from '@/lib/prefs';
import { EmptyState, PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { community, perms } = await loadCommunityForSettings((await params).slug);
  if (!perms.viewAudit) notFound();
  const t = await getTranslations('csettings');
  const prefs = await getPrefs();
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      diff: schema.auditLog.diff,
      reason: schema.auditLog.reason,
      createdAt: schema.auditLog.createdAt,
      actorName: schema.users.name,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .where(eq(schema.auditLog.communityId, community.id))
    .orderBy(desc(schema.auditLog.id))
    .limit(200);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('audit.title')} description={t('audit.description')} />
      {rows.length === 0 ? (
        <EmptyState title={t('audit.empty')} />
      ) : (
        <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('audit.title')}</caption>
            <thead className="border-b border-border text-start text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  {t('audit.when')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  {t('audit.who')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  {t('audit.what')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  {t('audit.details')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDateTime(r.createdAt, prefs.timeFormat)}
                  </td>
                  <td className="px-4 py-2">{r.actorName ?? t('audit.system')}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="max-w-md px-4 py-2 text-xs break-words text-muted">
                    {r.reason && <p>{r.reason}</p>}
                    {r.diff && Object.keys(r.diff).length > 0 && (
                      <code>{JSON.stringify(r.diff).slice(0, 300)}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
