import { getFormatter, getTranslations } from 'next-intl/server';
import { platformOverview } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { PageHeader } from '@/components/ui/misc';

export const metadata = { title: 'Overview' };

export default async function AdminOverviewPage() {
  const staff = await staffFor('console');
  const [t, format, o] = await Promise.all([
    getTranslations('admin'),
    getFormatter(),
    platformOverview(staff.id),
  ]);
  const stats = [
    { label: t('stats.users'), value: o.users, detail: t('stats.newUsers', { count: o.newUsers }) },
    { label: t('stats.communities'), value: o.communities },
    { label: t('stats.paid'), value: o.paid, detail: t('stats.gifted', { count: o.gifted }) },
    { label: t('stats.messages'), value: o.messages },
    { label: t('stats.reports'), value: o.openReports },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('overviewTitle')} description={t('overviewDescription')} />
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-ui-lg border border-border bg-surface p-4"
          >
            <dt className="text-sm font-semibold text-muted">{s.label}</dt>
            <dd className="text-3xl font-bold tabular-nums">{format.number(s.value)}</dd>
            {s.detail && <dd className="text-sm text-muted">{s.detail}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
