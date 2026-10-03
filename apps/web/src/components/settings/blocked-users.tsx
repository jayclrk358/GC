'use client';

import Link from '@/components/ui/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { unblockUserAction } from '@/app/actions/notifications';

export function BlockedUsers({
  users,
}: {
  users: { userId: string; name: string; username: string | null; image: string | null }[];
}) {
  const t = useTranslations('privacy');
  if (!users.length) return <p className="text-sm text-muted">{t('noneBlocked')}</p>;
  return (
    <ul className="divide-y divide-border">
      {users.map((u) => (
        <li key={u.userId} className="flex items-center justify-between gap-3 py-2">
          <span className="flex items-center gap-2">
            <Avatar src={u.image} name={u.name} size={32} />
            {u.username ? (
              <Link href={`/u/${u.username}`} className="font-semibold hover:underline">
                {u.name}
              </Link>
            ) : (
              <span className="font-semibold">{u.name}</span>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label={t('unblockNamed', { name: u.name })}
            onClick={async () => {
              // The action sends back the updated list itself.
              const r = await unblockUserAction(u.userId);
              if (r.ok) toast.success(t('unblocked', { name: u.name }));
              else toast.error(r.error);
            }}
          >
            {t('unblock')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
