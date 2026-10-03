import { getTranslations } from 'next-intl/server';
import { listStaff } from '@gamecentral/core';
import { staffFor } from '@/lib/staff';
import { PageHeader } from '@/components/ui/misc';
import { StaffManager } from '@/components/admin/staff-manager';

export const metadata = { title: 'Staff' };

export default async function AdminStaffPage() {
  const viewer = await staffFor('staff');
  const [t, staff] = await Promise.all([getTranslations('admin.staff'), listStaff(viewer.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <dl className="grid gap-x-6 gap-y-2 rounded-ui-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[8rem_1fr]">
        {(['owner', 'admin', 'moderator'] as const).map((r) => (
          <div key={r} className="contents">
            <dt className="font-semibold">{t(`can.${r}.name`)}</dt>
            <dd className="text-muted">{t(`can.${r}.text`)}</dd>
          </div>
        ))}
      </dl>
      <StaffManager staff={staff} viewer={{ id: viewer.id, role: viewer.role }} />
    </div>
  );
}
