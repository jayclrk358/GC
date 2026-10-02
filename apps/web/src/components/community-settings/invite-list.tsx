'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { revokeInviteAction } from '@/app/actions/invites';

export function InviteList({
  communityId,
  invites,
}: {
  communityId: string;
  invites: {
    code: string;
    uses: number;
    maxUses: number;
    expiresAt: string | null;
    createdAt: string;
    creatorName: string | null;
  }[];
}) {
  const t = useTranslations('invites');
  const locale = useLocale();
  const router = useRouter();
  if (!invites.length) return <EmptyState title={t('none')} />;
  return (
    <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('manageTitle')}</caption>
        <thead className="border-b border-border text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              {t('code')}
            </th>
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              {t('uses')}
            </th>
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              {t('expires')}
            </th>
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              {t('createdBy')}
            </th>
            <th scope="col" className="px-4 py-2">
              <span className="sr-only">{t('revoke')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invites.map((i) => (
            <tr key={i.code} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono">{i.code}</td>
              <td className="px-4 py-2 tabular-nums">
                {i.uses}
                {i.maxUses ? ` / ${i.maxUses}` : ''}
              </td>
              <td className="px-4 py-2">
                {i.expiresAt ? new Date(i.expiresAt).toLocaleString(locale) : t('noExpiry')}
              </td>
              <td className="px-4 py-2">{i.creatorName ?? '—'}</td>
              <td className="px-4 py-2 text-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await revokeInviteAction(communityId, i.code);
                    if (r.ok) router.refresh();
                    else toast.error(r.error);
                  }}
                >
                  {t('revoke')}
                  <span className="sr-only"> {i.code}</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
